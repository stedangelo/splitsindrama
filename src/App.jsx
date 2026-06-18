import { useState, useEffect } from "react";
import SplitSinDrama from "./SplitSinDrama";
import { useAuth, LoginScreen } from "./Auth";
import SalaView from "./SalaView";

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

function App() {
  const { user, loading } = useAuth();
  const hash = useHash();

  // Public sala route: /#/sala/<uuid>
  const salaMatch = hash.match(/^#\/sala\/([a-f0-9-]{36})$/);
  if (salaMatch) return <SalaView sessionId={salaMatch[1]} />;

  if (loading) return null;
  if (!user) return <LoginScreen />;

  return <SplitSinDrama user={user} />;
}

export default App;
