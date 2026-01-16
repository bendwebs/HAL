'use client';

import { useState, useEffect } from 'react';
import { documents } from '@/lib/api';
import { FileText, Upload, Trash2, Search, File, Image, FileSpreadsheet } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Document {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

const fileTypeIcons: Record<string, any> = {
  'application/pdf': FileText,
  'text/plain': File,
  'text/markdown': File,
  'image/': Image,
  'application/vnd': FileSpreadsheet,
};

function getFileIcon(contentType: string) {
  for (const [key, Icon] of Object.entries(fileTypeIcons)) {
    if (contentType.startsWith(key)) return Icon;
  }
  return File;
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async (search?: string) => {
    try {
      setIsLoading(true);
      const data = await documents.list(search);
      setDocs(data.documents);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDocuments(searchQuery);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        await documents.upload(files[i]);
        setUploadProgress(((i + 1) / files.length) * 100);
      }
      loadDocuments();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete this document?</p>
        <p className="text-sm text-text-secondary">This action cannot be undone.</p>
        <div className="flex gap-2 mt-1">
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
                await documents.delete(id);
                setDocs(docs.filter(d => d.id !== id));
                toast.success('Document deleted');
              } catch (err) {
                console.error('Failed to delete document:', err);
                toast.error('Failed to delete document');
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Document Library</h1>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <span>Upload</span>
            <input
              type="file"
              multiple
              onChange={handleUpload}
              className="hidden"
              accept=".pdf,.txt,.md,.doc,.docx,.csv,.json"
            />
          </label>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </form>

        {/* Upload Progress */}
        {isUploading && (
          <div className="mb-6 p-4 bg-surface border border-border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Uploading...</span>
              <span className="text-sm text-text-primary">{Math.round(uploadProgress)}%</span>
            </div>
            <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Documents List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">No documents yet</h2>
            <p className="text-text-secondary mb-6">Upload documents to use them in your chats</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map(doc => {
              const FileIcon = getFileIcon(doc.content_type);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl hover:border-border-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <FileIcon className="w-5 h-5 text-accent" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text-primary truncate">{doc.filename}</h3>
                    <div className="flex items-center gap-3 text-sm text-text-muted">
                      <span>{formatSize(doc.size)}</span>
                      <span>•</span>
                      <span>{doc.chunk_count} chunks</span>
                      <span>•</span>
                      <span>{formatRelativeTime(doc.created_at)}</span>
                    </div>
                  </div>
                  
                  <div className={`px-2 py-1 text-xs rounded ${
                    doc.status === 'ready' 
                      ? 'bg-success/10 text-success' 
                      : 'bg-warning/10 text-warning'
                  }`}>
                    {doc.status}
                  </div>
                  
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
