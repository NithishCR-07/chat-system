'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  IconArrowRight,
  IconSpinner,
  IconPlus,
  IconX,
  IconFilePdf,
  IconImage,
  IconFileText,
} from '@/components/icons/Icons';
import { formatFileSize, getMessageTypeFromFile } from '@/lib/storage/uploadMedia';

export function ChatMessageInput({
  recipientName = 'contact',
  onSendMessage,
  onSendAttachment,
  onTyping,
}) {
  const [text, setText] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Derive local preview URL without triggering cascading setState in effects
  const previewUrl = useMemo(() => {
    if (attachedFile && attachedFile.type?.startsWith('image/')) {
      return URL.createObjectURL(attachedFile);
    }
    return '';
  }, [attachedFile]);

  // Clean up object URL memory on change/unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle typing event notification
  function handleTextChange(e) {
    const val = e.target.value;
    setText(val);

    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 50MB check
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 50MB limit.');
      return;
    }

    setErrorMessage('');
    setAttachedFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function removeAttachedFile() {
    setAttachedFile(null);
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const cleanText = text.trim();

    if (!cleanText && !attachedFile) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (onTyping) onTyping(false);

    if (attachedFile) {
      const fileToUpload = attachedFile;
      const caption = cleanText;

      setAttachedFile(null);
      setText('');
      setErrorMessage('');

      if (onSendAttachment) {
        await onSendAttachment({ file: fileToUpload, caption });
      } else if (onSendMessage) {
        await onSendMessage(caption, fileToUpload);
      }
    } else {
      onSendMessage(cleanText);
      setText('');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // Drag & drop handlers
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 50MB limit.');
      return;
    }

    setErrorMessage('');
    setAttachedFile(file);
  }

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const fileType = attachedFile ? getMessageTypeFromFile(attachedFile) : 'text';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`p-3 md:p-4 border-t border-slate-200 bg-white shrink-0 transition-colors ${
        isDragging ? 'bg-sky-50/70' : 'bg-white'
      }`}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-rose-400 hover:text-rose-700 cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachment Staging Preview Chip */}
      {attachedFile && (
        <div className="mb-2 p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {fileType === 'image' && previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : fileType === 'pdf' ? (
              <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <IconFilePdf className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-sky-100 text-[#1f6fb2] flex items-center justify-center shrink-0">
                <IconFileText className="w-5 h-5" />
              </div>
            )}

            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {attachedFile.name}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                {formatFileSize(attachedFile.size)} • {fileType.toUpperCase()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={removeAttachedFile}
            className="w-7 h-7 rounded-lg bg-slate-200/80 hover:bg-rose-100 hover:text-rose-600 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Remove attachment"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Bar Form */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="border border-slate-200 rounded-2xl p-1.5 bg-white shadow-2xs focus-within:border-[#1f6fb2] focus-within:ring-4 focus-within:ring-[#1f6fb2]/10 transition-all flex items-center gap-1.5">
          {/* + Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-[#1f6fb2]/10 hover:text-[#1f6fb2] text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95"
            title="Attach Image or PDF Document"
          >
            <IconPlus className="w-4 h-4 stroke-[2.5]" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            placeholder={
              attachedFile
                ? 'Add an optional caption... (Press Enter to send)'
                : `Message ${recipientName}... (Press Enter)`
            }
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none px-2 py-2 min-w-0"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!text.trim() && !attachedFile}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] hover:opacity-95 text-white font-medium rounded-xl text-xs cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shrink-0"
            title="Send Message"
          >
            <span>Send</span>
            <IconArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
