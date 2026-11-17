"""Direct PostgreSQL data access for the existing Nexus controllers.

Only internal controller queries are assembled here. Relations are allowlisted,
identifiers are quoted, values are bound, and RLS owns tenant authorization.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import psycopg
from postgrest.exceptions import APIError
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg.types.string import StrDumperUnknown
from psycopg_pool import ConnectionPool

TABLES = frozenset(
    {
        "chat_messages",
        "chat_sessions",
        "email_accounts",
        "email_accounts_safe",
        "email_drafts",
        "media",
        "nexus_emails",
        "nexus_note_items",
        "nexus_note_label_links",
        "nexus_note_labels",
        "nexus_notes",
        "nexus_task_lists",
        "nexus_tasks",
    }
)
MAIL_TABLES = frozenset({"email_accounts", "nexus_emails"})
JSON_COLUMNS = frozenset({"to_addresses", "cc_addresses", "attachments_meta"})


@dataclass(frozen=True)
class DatabaseIdentity:
    """An opaque in-process identity constructed after session verification."""

    user_id: UUID


def connection_pool(dsn: str, *, max_size: int = 4) -> ConnectionPool:
    def configure(conn: psycopg.Connection) -> None:
        conn.adapters.register_dumper(str, StrDumperUnknown)
        with conn.transaction():
            role = conn.execute(
                """
                SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user
                """
            ).fetchone()
            # RLS is ineffective with either capability, regardless of query design.
            if role != {"rolsuper": False, "rolbypassrls": False}:
                raise psycopg.OperationalError(
                    "Nexus runtime role can bypass row security"
                )

    return ConnectionPool(
        dsn,
        kwargs={"connect_timeout": 4, "row_factory": dict_row},
        configure=configure,
        min_size=1,
        max_size=max_size,
        timeout=5,
        open=False,
    )


def json_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def assignment(column: str) -> sql.Composed:
    return sql.SQL("{} = %s").format(sql.Identifier(column))


def bound_value(column: str, value: Any) -> Any:
    return Jsonb(value) if column in JSON_COLUMNS and value is not None else value


class PostgresDataClient:
    def __init__(
        self,
        pool: ConnectionPool,
        identity: DatabaseIdentity | None,
        *,
        mail: bool = False,
    ) -> None:
        if mail == (identity is not None):
            raise ValueError(
                "Data clients require either a verified user or the mail role"
            )
        self.pool = pool
        self.identity = identity
        self.tables = MAIL_TABLES if mail else TABLES
        self.postgrest = self  # Compatibility for the existing mail poller.

    def from_(self, table: str) -> Query:
        if table not in self.tables:
            raise ValueError("Unknown Nexus relation")
        return Query(self, table)

    def aclose(self) -> None:
        # The connection is always returned by Query.execute. The app owns the pool.
        pass


class Query:
    def __init__(self, client: PostgresDataClient, table: str) -> None:
        self.client = client
        self.table = sql.Identifier("public", table)
        self.mode = "select"
        self.columns: sql.Composable = sql.SQL("*")
        self.predicates: list[sql.Composable] = []
        self.parameters: list[Any] = []
        self.sorts: list[sql.Composable] = []
        self.size: int | None = None
        self.offset = 0
        self.one = False
        self.values: list[dict] = []
        self.conflict: tuple[str, ...] = ()
        self.ignore_duplicates = False
        self.returning = True
        self.negate = False

    def select(self, columns: str) -> Query:
        if columns != "*":
            self.columns = sql.SQL(", ").join(
                sql.Identifier(c.strip()) for c in columns.split(",")
            )
        return self

    def _predicate(self, clause: sql.Composable, *parameters: Any) -> Query:
        self.predicates.append(clause)
        self.parameters.extend(parameters)
        return self

    def eq(self, column: str, value: Any) -> Query:
        return self._predicate(assignment(column), value)

    def neq(self, column: str, value: Any) -> Query:
        return self._predicate(
            sql.SQL("{} <> %s").format(sql.Identifier(column)), value
        )

    def lt(self, column: str, value: Any) -> Query:
        return self._predicate(sql.SQL("{} < %s").format(sql.Identifier(column)), value)

    def in_(self, column: str, values: list) -> Query:
        if not values:
            return self._predicate(sql.SQL("false"))
        parts = sql.SQL(", ").join(sql.Placeholder() for _ in values)
        return self._predicate(
            sql.SQL("{} IN ({})").format(sql.Identifier(column), parts), *values
        )

    @property
    def not_(self) -> Query:
        self.negate = True
        return self

    def is_(self, column: str, value: str) -> Query:
        if value != "null":
            raise ValueError("Unsupported IS filter")
        template = sql.SQL("{} IS NOT NULL") if self.negate else sql.SQL("{} IS NULL")
        self.negate = False
        return self._predicate(template.format(sql.Identifier(column)))

    def order(self, column: str, *, desc: bool = False) -> Query:
        direction = sql.SQL("DESC") if desc else sql.SQL("ASC")
        self.sorts.append(sql.SQL("{} {}").format(sql.Identifier(column), direction))
        return self

    def range(self, start: int, end: int) -> Query:
        self.offset = start
        return self.limit(end - start + 1)

    def limit(self, count: int) -> Query:
        self.size = count
        return self

    def maybe_single(self) -> Query:
        self.one = True
        return self

    def insert(self, values: dict | list[dict]) -> Query:
        self.mode = "insert"
        self.values = [values] if isinstance(values, dict) else values
        return self

    def update(self, values: dict) -> Query:
        self.mode = "update"
        self.values = [values]
        return self

    def delete(self) -> Query:
        self.mode = "delete"
        return self

    def upsert(
        self,
        values: dict | list[dict],
        *,
        on_conflict: str,
        ignore_duplicates: bool = False,
        default_to_null: bool = True,
        returning: Any = None,
    ) -> Query:
        self.insert(values)
        self.conflict = tuple(column.strip() for column in on_conflict.split(","))
        self.ignore_duplicates = ignore_duplicates
        self.returning = returning != "minimal"
        # Omitted keys use the schema default on insert. On conflict only supplied
        # fields are updated, including when provider reconciliation uses sparse rows.
        if default_to_null and self.values:
            keys = set().union(*(row.keys() for row in self.values))
            self.values = [dict.fromkeys(keys) | row for row in self.values]
        return self

    def inbox_search(self, term: str) -> Query:
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        return self._predicate(
            sql.SQL(
                "(subject ILIKE %s OR from_address ILIKE %s OR from_name ILIKE %s "
                "OR snippet ILIKE %s)"
            ),
            *([pattern] * 4),
        )

    def inbox_cursor(self, stamp: str, message_id: str) -> Query:
        return self._predicate(
            sql.SQL("(provider_date, id) < (%s, %s)"), stamp, message_id
        )

    def _where(self) -> sql.Composable:
        if not self.predicates:
            return sql.SQL("")
        return sql.SQL(" WHERE ") + sql.SQL(" AND ").join(self.predicates)

    def _select(self, conn: psycopg.Connection) -> list[dict]:
        statement = sql.SQL("SELECT {} FROM {}").format(self.columns, self.table)
        statement += self._where()
        parameters = list(self.parameters)
        if self.sorts:
            statement += sql.SQL(" ORDER BY ") + sql.SQL(", ").join(self.sorts)
        limit = 2 if self.one else self.size
        if limit is not None:
            statement += sql.SQL(" LIMIT %s OFFSET %s")
            parameters.extend((limit, self.offset))
        return conn.execute(statement, parameters).fetchall()

    def _insert(self, conn: psycopg.Connection) -> list[dict]:
        results = []
        for row in self.values:
            columns = list(row)
            statement = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                self.table,
                sql.SQL(", ").join(map(sql.Identifier, columns)),
                sql.SQL(", ").join(sql.Placeholder() for _ in columns),
            )
            if self.conflict:
                statement += sql.SQL(" ON CONFLICT ({})").format(
                    sql.SQL(", ").join(map(sql.Identifier, self.conflict))
                )
                updates = [column for column in columns if column not in self.conflict]
                if self.ignore_duplicates or not updates:
                    statement += sql.SQL(" DO NOTHING")
                else:
                    statement += sql.SQL(" DO UPDATE SET ") + sql.SQL(", ").join(
                        sql.SQL("{0} = excluded.{0}").format(sql.Identifier(column))
                        for column in updates
                    )
            if self.returning:
                statement += sql.SQL(" RETURNING *")
            cursor = conn.execute(statement, [bound_value(c, row[c]) for c in columns])
            if self.returning:
                results.extend(cursor.fetchall())
        return results

    def _write(self, conn: psycopg.Connection) -> list[dict]:
        if not self.predicates:
            raise ValueError("Update and delete require an explicit predicate")
        parameters = list(self.parameters)
        if self.mode == "update":
            row = self.values[0]
            statement = sql.SQL("UPDATE {} SET {}").format(
                self.table, sql.SQL(", ").join(assignment(column) for column in row)
            )
            parameters = [
                bound_value(column, value) for column, value in row.items()
            ] + parameters
        else:
            statement = sql.SQL("DELETE FROM {}").format(self.table)
        return conn.execute(
            statement + self._where() + sql.SQL(" RETURNING *"), parameters
        ).fetchall()

    def execute(self) -> SimpleNamespace:
        try:
            with self.client.pool.connection() as conn:
                if self.client.identity is not None:
                    conn.execute(
                        "SELECT set_config('nexus.user_id', %s, true)",
                        (str(self.client.identity.user_id),),
                    )
                if self.mode == "select":
                    rows = self._select(conn)
                elif self.mode == "insert":
                    rows = self._insert(conn)
                else:
                    rows = self._write(conn)
        except psycopg.Error as exc:
            raise APIError(
                {"code": exc.sqlstate, "message": "Nexus database request failed"}
            ) from None
        data = [{key: json_value(value) for key, value in row.items()} for row in rows]
        if self.one:
            if len(data) > 1:
                raise APIError(
                    {"code": "PGRST116", "message": "Expected one matching record"}
                )
            return SimpleNamespace(data=data[0] if data else None)
        return SimpleNamespace(data=data)
