import { createContext, useContext, useState } from "react";

interface PadiContextValue {
  selectedPadiId: string | null;
  setSelectedPadiId: (id: string | null) => void;
  showingDiscovery: boolean;
  setShowingDiscovery: (v: boolean) => void;
  selectPadi: (id: string | null) => void;
  showDiscovery: () => void;
}

const PadiContext = createContext<PadiContextValue>({
  selectedPadiId: null,
  setSelectedPadiId: () => {},
  showingDiscovery: false,
  setShowingDiscovery: () => {},
  selectPadi: () => {},
  showDiscovery: () => {},
});

export function PadiProvider({ children }: { children: React.ReactNode }) {
  const [selectedPadiId, setSelectedPadiId] = useState<string | null>(null);
  const [showingDiscovery, setShowingDiscovery] = useState(false);

  function selectPadi(id: string | null) {
    setSelectedPadiId(id);
    setShowingDiscovery(false);
  }

  function showDiscovery() {
    setSelectedPadiId(null);
    setShowingDiscovery(true);
  }

  return (
    <PadiContext.Provider value={{ selectedPadiId, setSelectedPadiId, showingDiscovery, setShowingDiscovery, selectPadi, showDiscovery }}>
      {children}
    </PadiContext.Provider>
  );
}

export function usePadi() {
  return useContext(PadiContext);
}
