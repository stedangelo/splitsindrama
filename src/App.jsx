import SplitSinDrama from "./SplitSinDrama";
import { useAuth, LoginScreen } from "./Auth";

function App() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginScreen />;

  return <SplitSinDrama user={user} />;
}

export default App
