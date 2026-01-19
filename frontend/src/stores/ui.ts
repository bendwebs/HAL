import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Chat list refresh trigger
  chatListVersion: number;
  refreshChatList: () => void;
  
  // Transparency settings (per-session override)
  showThinking: boolean;
  showActions: boolean;
  showSubagents: boolean;
  setShowThinking: (show: boolean) => void;
  setShowActions: (show: boolean) => void;
  setShowSubagents: (show: boolean) => void;
  
  // Mobile bottom nav
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Modals
  activeModal: string | null;
  modalData: any;
  openModal: (modal: string, data?: any) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  // Chat list refresh - increment version to trigger re-fetch
  chatListVersion: 0,
  refreshChatList: () => set((state) => ({ chatListVersion: state.chatListVersion + 1 })),
  
  // Transparency (defaults, will be overridden by user settings)
  showThinking: true,
  showActions: true,
  showSubagents: true,
  setShowThinking: (show) => set({ showThinking: show }),
  setShowActions: (show) => set({ showActions: show }),
  setShowSubagents: (show) => set({ showSubagents: show }),
  
  // Mobile
  activeTab: 'chat',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // Modals
  activeModal: null,
  modalData: null,
  openModal: (modal, data = null) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));
