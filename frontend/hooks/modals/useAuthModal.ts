import { create } from 'zustand';

// the hook to define when to open and close the modal
interface AuthModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

//extract the set() from createStore/zustand
const useAuthModal = create<AuthModalStore>((set) => ({
  isOpen: false, //by default it is false
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));

export default useAuthModal;