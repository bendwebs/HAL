'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { documents } from '@/lib/api';
import { 
  FileText, 
  Upload, 
  Trash2, 
  Search, 
  File, 
  Image as ImageIcon, 
  FileSpreadsheet,
  Download,
  Eye,
  X,
  Loader2,
  FileJson,
  FileCode
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Document {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

const fileTypeIcons: Record<string, any> = {
  'application/pdf': FileText,
  'text/plain': File,
  'text/markdown': FileCode,
  'text/csv': FileSpreadsheet,
  'application/json': FileJson,
  'image/': ImageIcon,
  'application/vnd': FileSpreadsheet,
};

function getFileIcon(contentType: string) {
  for (const [key, Icon] of Object.entries(fileTypeIcons)) {
    if (contentType.startsWith(key)) return Icon;
  }
  return File;
}

function isImageType(contentType: string) {
  return contentType.startsWith('image/');
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [imageThumbnails, setImageThumbnails] = useState<Record<string, string>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Load image thumbnails with auth
  const loadImageThumbnail = useCallback(async (docId: string) => {
    if (imageThumbnails[docId]) return;
    
    try {
      const token = localStorage.getItem('hal_token');
      const response = await fetch(documents.getPreviewUrl(docId), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageThumbnails(prev => ({ ...prev, [docId]: url }));
      }
    } catch (err) {
      console.error('Failed to load thumbnail:', err);
    }
  }, [imageThumbnails]);

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
      toast.error('Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDocuments(searchQuery);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!files.length) return;

    setIsUploading(true);
    setUploadProgress(0);

    const fileArray = Array.from(files);
    let successCount = 0;

    try {
      for (let i = 0; i < fileArray.length; i++) {
        try {
          await documents.upload(fileArray[i]);
          successCount++;
        } catch (err) {
          console.error(`Failed to upload ${fileArray[i].name}:`, err);
          toast.error(`Failed to upload ${fileArray[i].name}`);
        }
        setUploadProgress(((i + 1) / fileArray.length) * 100);
      }
      
      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
        loadDocuments();
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging false if leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFiles(files);
    }
  }, []);

  const handleDelete = async (id: string, filename: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete "{filename}"?</p>
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
    ), { duration: Infinity });
  };

  const handlePreview = async (doc: Document) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewContent(null);

    try {
      if (isImageType(doc.content_type)) {
        // For images, use cached thumbnail or fetch with auth
        if (imageThumbnails[doc.id]) {
          setPreviewContent({ type: 'image', url: imageThumbnails[doc.id] });
        } else {
          const token = localStorage.getItem('hal_token');
          const response = await fetch(documents.getPreviewUrl(doc.id), {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setImageThumbnails(prev => ({ ...prev, [doc.id]: url }));
            setPreviewContent({ type: 'image', url });
          } else {
            throw new Error('Failed to load image');
          }
        }
      } else {
        // For other files, fetch preview data
        const data = await documents.getPreview(doc.id);
        setPreviewContent(data);
      }
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreviewContent({ type: 'error', message: 'Failed to load preview' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = (doc: Document) => {
    // Open download URL in new tab (will trigger download)
    const url = documents.getDownloadUrl(doc.id);
    const token = localStorage.getItem('hal_token');
    
    // Create a temporary link with auth
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = doc.original_filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(err => {
        console.error('Download failed:', err);
        toast.error('Download failed');
      });
  };

  const formatSize = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div 
      ref={dropZoneRef}
      className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/20 border-2 border-dashed border-accent rounded-xl z-50 flex items-center justify-center">
          <div className="text-center">
            <Upload className="w-16 h-16 text-accent mx-auto mb-4" />
            <p className="text-xl font-semibold text-accent">Drop files here to upload</p>
            <p className="text-text-secondary mt-2">Supported: PDF, TXT, MD, DOCX, Images, CSV, JSON</p>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Document Library</h1>
          
          {/* Upload button - hidden input triggered by label */}
          <label className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Upload</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInput}
              className="hidden"
              accept=".pdf,.txt,.md,.doc,.docx,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
            />
          </label>
        </div>

        {/* Drag & Drop hint for desktop */}
        <div className="hidden md:block mb-4 p-3 bg-surface/50 border border-dashed border-border rounded-lg text-center text-sm text-text-muted">
          <span>Drag and drop files here, or click Upload</span>
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

        {/* Documents Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">No documents yet</h2>
            <p className="text-text-secondary mb-6">Upload documents to use them in your chats</p>
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg cursor-pointer transition-colors">
              <Upload className="w-5 h-5" />
              <span>Upload your first document</span>
              <input
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                accept=".pdf,.txt,.md,.doc,.docx,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map(doc => {
              const FileIcon = getFileIcon(doc.content_type);
              const isImage = isImageType(doc.content_type);
              
              // Load thumbnail for images
              if (isImage && !imageThumbnails[doc.id]) {
                loadImageThumbnail(doc.id);
              }
              
              return (
                <div
                  key={doc.id}
                  className="group bg-surface border border-border rounded-xl overflow-hidden hover:border-accent transition-colors"
                >
                  {/* Preview area - clickable */}
                  <button
                    onClick={() => handlePreview(doc)}
                    className="w-full h-32 flex items-center justify-center bg-bg-tertiary relative overflow-hidden"
                  >
                    {isImage && imageThumbnails[doc.id] ? (
                      <img
                        src={imageThumbnails[doc.id]}
                        alt={doc.original_filename}
                        className="w-full h-full object-cover"
                      />
                    ) : isImage ? (
                      <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
                    ) : (
                      <FileIcon className="w-12 h-12 text-text-muted" />
                    )}
                    
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Eye className="w-8 h-8 text-white" />
                    </div>
                  </button>
                  
                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-medium text-text-primary truncate text-sm" title={doc.original_filename}>
                      {doc.original_filename}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                      <span>{formatSize(doc.file_size)}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(doc.created_at)}</span>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                      <button
                        onClick={() => handleDownload(doc)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-accent hover:bg-accent/10 rounded transition-colors"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.original_filename)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-error hover:bg-error/10 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <>
          <div 
            className="fixed inset-0 bg-black/70 z-50"
            onClick={() => setPreviewDoc(null)}
          />
          <div className="fixed inset-4 md:inset-10 bg-bg-elevated border border-border rounded-xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                {(() => {
                  const FileIcon = getFileIcon(previewDoc.content_type);
                  return <FileIcon className="w-5 h-5 text-accent flex-shrink-0" />;
                })()}
                <div className="min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">{previewDoc.original_filename}</h3>
                  <p className="text-xs text-text-muted">{formatSize(previewDoc.file_size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewDoc)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-2 hover:bg-surface rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              {previewLoading ? (
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
              ) : previewContent?.type === 'image' ? (
                <img
                  src={previewContent.url}
                  alt={previewDoc.original_filename}
                  className="max-w-full max-h-full object-contain"
                />
              ) : previewContent?.type === 'text' ? (
                <div className="w-full h-full">
                  <pre className="w-full h-full p-4 bg-surface rounded-lg overflow-auto text-sm text-text-primary font-mono whitespace-pre-wrap">
                    {previewContent.content}
                    {previewContent.truncated && (
                      <span className="text-text-muted block mt-4">... (truncated)</span>
                    )}
                  </pre>
                </div>
              ) : previewContent?.type === 'document' ? (
                <div className="text-center">
                  <FileText className="w-16 h-16 text-text-muted mx-auto mb-4" />
                  <p className="text-text-secondary mb-4">{previewContent.message}</p>
                  <button
                    onClick={() => handleDownload(previewDoc)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download to view
                  </button>
                </div>
              ) : previewContent?.type === 'error' ? (
                <div className="text-center text-error">
                  <p>{previewContent.message}</p>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
