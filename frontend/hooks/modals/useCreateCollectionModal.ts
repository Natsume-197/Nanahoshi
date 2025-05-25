import { create } from 'zustand';

//its is sim as Auth modal
interface CreateCollectionModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const useCreateCollectionModal = create<CreateCollectionModalStore>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));

export default useCreateCollectionModal;