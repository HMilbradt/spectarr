'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IMAGE_MAX_FILE_SIZE } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface ImageCaptureProps {
  onScanStart: (file: File) => void;
  isUploading: boolean;
}

export function ImageCapture({ onScanStart, isUploading }: ImageCaptureProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = useCallback((file: File) => {
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > IMAGE_MAX_FILE_SIZE) {
      setError('Image exceeds 20MB limit');
      return;
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleSubmit() {
    if (selectedFile) {
      onScanStart(selectedFile);
    }
  }

  function clearSelection() {
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-4">
      {!preview ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          )}
        >
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">Drop image or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports JPG, PNG, WebP up to 20MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="w-full max-h-80 object-contain bg-muted"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedFile?.name} ({(selectedFile!.size / 1024 / 1024).toFixed(1)} MB)
            </div>
            <Button variant="ghost" size="sm" onClick={clearSelection} disabled={isUploading}>
              Change
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!selectedFile || isUploading}
        className="w-full"
        size="lg"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <Camera className="h-4 w-4 mr-2" />
            Scan Shelf
          </>
        )}
      </Button>
    </div>
  );
}
