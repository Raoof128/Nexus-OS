// Users tab: the account signed in to this browser.
export default function UsersPanel({ userName, signedIn, provider }) {
  return (
    <table aria-label="Users" className="w-full">
      <thead>
        <tr>
          <th scope="col">User</th>
          <th scope="col">Status</th>
          <th scope="col">Sign-in provider</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{signedIn ? userName : '—'}</td>
          <td>{signedIn ? 'Active' : 'Signed out'}</td>
          <td>{signedIn ? provider : '—'}</td>
        </tr>
      </tbody>
    </table>
  )
}
