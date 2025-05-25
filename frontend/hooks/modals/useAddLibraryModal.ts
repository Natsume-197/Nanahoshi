import { create } from 'zustand';

//its is sim as Auth modal
interface AddLibraryModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const useAddLibraryModal = create<AddLibraryModalStore>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));

export default useAddLibraryModal;