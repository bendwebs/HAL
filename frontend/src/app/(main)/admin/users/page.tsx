'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { admin } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { 
  Users, Search, Edit2, Trash2, Shield, User, 
  ChevronLeft, Save, X, Eye, EyeOff, Calendar,
  HardDrive, AlertCircle, Loader2
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface UserData {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  storage_used: number;
  created_at: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editPassword, setEditPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async (search?: string) => {
    try {
      setIsLoading(true);
      const data = await admin.users.list(search);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers(searchQuery || undefined);
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name);
    setEditRole(user.role);
    setEditPassword('');
    setShowPassword(false);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
    setEditPassword('');
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    
    setIsSaving(true);
    try {
      const updates: any = {};
      
      if (editDisplayName !== editingUser.display_name) {
        updates.display_name = editDisplayName;
      }
      if (editRole !== editingUser.role) {
        updates.role = editRole;
      }
      if (editPassword) {
        updates.password = editPassword;
      }
      
      if (Object.keys(updates).length === 0) {
        toast('No changes to save', { icon: 'ℹ️' });
        closeEditModal();
        return;
      }
      
      await admin.users.update(editingUser.id, updates);
      toast.success('User updated successfully');
      closeEditModal();
      loadUsers(searchQuery || undefined);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (user: UserData) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot delete your own account");
      return;
    }
    
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete user "{user.username}"?</p>
        <p className="text-sm text-text-secondary">
          This will permanently delete the user and all their data including chats, documents, and memories.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await admin.users.delete(user.id);
                setUsers(users.filter(u => u.id !== user.id));
                toast.success('User deleted');
              } catch (err: any) {
                toast.error(err.message || 'Failed to delete user');
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
          >
            Delete User
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/admin')}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">User Management</h1>
            <p className="text-sm text-text-muted">{users.length} users total</p>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username or display name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </form>

        {/* Users List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">No users found</h2>
            <p className="text-text-secondary">
              {searchQuery ? 'Try a different search term' : 'No users in the system'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map(user => (
              <div
                key={user.id}
                className="p-4 bg-surface border border-border rounded-xl hover:border-border-hover transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    user.role === 'admin' ? 'bg-warning/10' : 'bg-accent/10'
                  }`}>
                    {user.role === 'admin' ? (
                      <Shield className="w-6 h-6 text-warning" />
                    ) : (
                      <User className="w-6 h-6 text-accent" />
                    )}
                  </div>
                  
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-text-primary truncate">
                        {user.display_name}
                      </h3>
                      {user.id === currentUser?.id && (
                        <span className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted truncate">@{user.username}</p>
                  </div>
                  
                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-text-muted">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.role === 'admin' 
                          ? 'bg-warning/10 text-warning' 
                          : 'bg-surface-hover text-text-secondary'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-muted" title="Storage used">
                      <HardDrive className="w-4 h-4" />
                      <span>{formatBytes(user.storage_used)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-muted" title="Created">
                      <Calendar className="w-4 h-4" />
                      <span>{formatRelativeTime(user.created_at)}</span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(user)}
                      className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                      title="Edit user"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      disabled={user.id === currentUser?.id}
                      className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={user.id === currentUser?.id ? "Cannot delete yourself" : "Delete user"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Mobile stats */}
                <div className="sm:hidden flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-text-muted">
                  <span className={`px-2 py-1 rounded font-medium ${
                    user.role === 'admin' 
                      ? 'bg-warning/10 text-warning' 
                      : 'bg-surface-hover text-text-secondary'
                  }`}>
                    {user.role}
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {formatBytes(user.storage_used)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatRelativeTime(user.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeEditModal}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary">
                Edit User
              </h2>
              <button
                onClick={closeEditModal}
                className="p-2 text-text-muted hover:text-text-primary rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Username (read-only) */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Username</label>
                <input
                  type="text"
                  value={editingUser.username}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-muted cursor-not-allowed"
                />
                <p className="text-xs text-text-muted mt-1">Username cannot be changed</p>
              </div>
              
              {/* Display Name */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              
              {/* Role */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Role</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditRole('user')}
                    disabled={editingUser.id === currentUser?.id}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                      editRole === 'user'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'border-border text-text-secondary hover:border-border-hover'
                    } ${editingUser.id === currentUser?.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <User className="w-4 h-4" />
                    User
                  </button>
                  <button
                    onClick={() => setEditRole('admin')}
                    disabled={editingUser.id === currentUser?.id}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                      editRole === 'admin'
                        ? 'bg-warning/10 border-warning text-warning'
                        : 'border-border text-text-secondary hover:border-border-hover'
                    } ${editingUser.id === currentUser?.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Shield className="w-4 h-4" />
                    Admin
                  </button>
                </div>
                {editingUser.id === currentUser?.id && (
                  <p className="text-xs text-warning mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    You cannot change your own role
                  </p>
                )}
              </div>
              
              {/* New Password */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  New Password (optional)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUser}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
