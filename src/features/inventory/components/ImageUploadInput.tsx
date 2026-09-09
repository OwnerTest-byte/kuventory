import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, X, Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ImageUploadInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
}

export const ImageUploadInput: React.FC<ImageUploadInputProps> = ({
  value,
  onChange,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compress and convert local image to optimized Base64 data URL
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    // Limit raw file input to 15MB
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('Image file is too large. Please choose an image under 15MB.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 600; // Optimal thumbnail resolution for inventory cards
          let { width, height } = img;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas context unavailable');
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Export as compressed WebP (or JPEG fallback)
          const dataUrl = canvas.toDataURL('image/webp', 0.85);
          onChange(dataUrl);
          setIsProcessing(false);
        } catch (err) {
          console.warn('Canvas resize failed, falling back to raw data URL:', err);
          onChange(event.target?.result as string);
          setIsProcessing(false);
        }
      };

      img.onerror = () => {
        setErrorMessage('Failed to read image data.');
        setIsProcessing(false);
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      setErrorMessage('Failed to read selected file.');
      setIsProcessing(false);
    };

    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleApplyUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    const trimmed = urlInput.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setErrorMessage('Please enter a valid web image URL starting with http:// or https://');
      return;
    }

    setErrorMessage(null);
    onChange(trimmed);
    setUrlInput('');
  };

  const handleClearImage = () => {
    onChange(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-primary" />
          Item Product Photo
        </label>
        {value && (
          <button
            type="button"
            onClick={handleClearImage}
            className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" /> Remove Photo
          </button>
        )}
      </div>

      {/* Preview Box if image exists */}
      {value ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
          <div className="w-16 h-16 rounded-lg bg-card border border-border overflow-hidden shrink-0 flex items-center justify-center p-1 relative">
            <img
              src={value}
              alt="Item preview"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
                setErrorMessage('Image URL could not be loaded.');
              }}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-semibold text-foreground truncate">Photo uploaded</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {value.startsWith('data:') ? 'Local file (compressed)' : value}
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-6 text-[10px] px-2 font-bold gap-1 cursor-pointer"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearImage}
                className="h-6 text-[10px] px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-bold gap-1 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" /> Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Upload or URL input tabs */
        <div className="space-y-2.5">
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border w-fit text-xs">
            <button
              type="button"
              onClick={() => { setActiveTab('upload'); setErrorMessage(null); }}
              className={cn(
                "px-2.5 py-1 rounded-md font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === 'upload'
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Upload className="w-3 h-3" /> Upload File
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('url'); setErrorMessage(null); }}
              className={cn(
                "px-2.5 py-1 rounded-md font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === 'url'
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LinkIcon className="w-3 h-3" /> Image URL
            </button>
          </div>

          {activeTab === 'upload' ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40 space-y-1"
            >
              {isProcessing ? (
                <div className="py-2 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-xs font-semibold">Processing image...</span>
                </div>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
                    <Upload className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-bold text-foreground">
                    Click to browse or drop an image here
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    PNG, JPG, WEBP, or SVG (compressed automatically)
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/photos/item.jpg"
                  className="h-8 text-xs bg-card border-border flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyUrl}
                  disabled={!urlInput.trim()}
                  className="h-8 text-xs px-3 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 cursor-pointer"
                >
                  Apply
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Paste any direct public image URL
              </p>
            </div>
          )}

          {errorMessage && (
            <p className="text-xs text-rose-500 font-semibold flex items-center gap-1">
              <X className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
