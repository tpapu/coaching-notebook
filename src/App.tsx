import { AuthGate } from './components/AuthGate'
import { TabShell } from './components/TabShell'

export default function App() {
  return (
    <AuthGate>
      <TabShell />
    </AuthGate>
  )
}
