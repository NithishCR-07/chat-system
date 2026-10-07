'use client';
/* eslint-disable @next/next/no-img-element */

import { useRef, useEffect, useState } from 'react';
import { TypingIndicator } from './TypingIndicator';
import { MessageItem } from './MessageItem';
import {
  IconSpinner,
  IconSparkles,
  IconUsers,
  IconDownload,
  IconX,
} from '@/components/icons/Icons';
import { triggerFileDownload, getFilePreviewUrl } from '@/lib/storage/uploadMedia';

export function ChatMessageList({
  messages = [],
  currentUserId,
  currentUser,
  recipient,
  conversation,
  isGroup = false,
  isLoading,
  isLoadingOlder,
  hasMore,
  onLoadOlder,
  onRetryMessage,
  onDeleteMessage,
  isRecipientTyping = false,
  typingUsers = [],
}) {
  const containerRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const hasInitiallyScrolledRef = useRef(false);

  // Close lightbox on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && lightboxImage) {
        setLightboxImage(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  // Check scroll position & trigger older messages load
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottomPill(distanceFromBottom > 150);

    // Infinite scroll trigger near top
    if (
      hasInitiallyScrolledRef.current &&
      el.scrollTop < 40 &&
      el.scrollHeight > el.clientHeight + 100 &&
      hasMore &&
      !isLoadingOlder &&
      onLoadOlder
    ) {
      const prevScrollHeight = el.scrollHeight;
      onLoadOlder().then(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            const newScrollHeight = containerRef.current.scrollHeight;
            containerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      });
    }
  }

  // Smart auto-scroll on new messages
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isNewMessageAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isNewMessageAdded && hasInitiallyScrolledRef.current) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < 180) {
        bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Initial scroll to bottom when conversation loads
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: 'auto' });
      const timer = setTimeout(() => {
        hasInitiallyScrolledRef.current = true;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading, messages.length]);

  function scrollToBottom() {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottomPill(false);
  }

  const chatTitle = isGroup
    ? conversation?.name || 'Group Chat'
    : recipient?.full_name || recipient?.email?.split('@')[0] || conversation?.name || 'User';

  return (
    <div className="relative flex-1 flex flex-col min-h-0 bg-slate-50/40">
      {/* Scrollable Message Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5"
      >
        {/* Load older messages spinner */}
        {hasMore && (
          <div className="flex justify-center py-2">
            {isLoadingOlder ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <IconSpinner className="w-3.5 h-3.5 text-[#1f6fb2]" />
                <span>Loading older history...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLoadOlder}
                className="text-xs text-[#1f6fb2] hover:underline font-medium cursor-pointer"
              >
                Load older messages
              </button>
            )}
          </div>
        )}

        {/* Initial loading state: High-Performance Skeleton Stream */}
        {isLoading ? (
          <div className="space-y-4 py-2 animate-fadeIn select-none">
            {/* Incoming skeleton message */}
            <div className="flex items-end gap-2.5 max-w-sm">
              <div className="w-8 h-8 rounded-xl bg-slate-200/80 animate-pulse shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-20 bg-slate-200/60 rounded-md animate-pulse" />
                <div className="h-10 bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs p-3 shadow-2xs animate-pulse" />
              </div>
            </div>

            {/* Outgoing skeleton message */}
            <div className="flex justify-end">
              <div className="h-10 w-48 bg-gradient-to-r from-[#1f6fb2]/20 to-[#2ec4b6]/20 border border-[#1f6fb2]/20 rounded-2xl rounded-br-xs animate-pulse shadow-2xs" />
            </div>

            {/* Incoming skeleton attachment */}
            <div className="flex items-end gap-2.5 max-w-xs">
              <div className="w-8 h-8 rounded-xl bg-slate-200/80 animate-pulse shrink-0" />
              <div className="h-28 w-44 bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs p-3 shadow-2xs animate-pulse flex flex-col justify-between">
                <div className="h-4 w-28 bg-slate-200/60 rounded-md" />
                <div className="h-8 bg-slate-100 rounded-xl" />
              </div>
            </div>

            {/* Outgoing skeleton message */}
            <div className="flex justify-end">
              <div className="h-12 w-64 bg-gradient-to-r from-[#1f6fb2]/20 to-[#2ec4b6]/20 border border-[#1f6fb2]/20 rounded-2xl rounded-br-xs animate-pulse shadow-2xs" />
            </div>
          </div>
        ) : messages.length > 0 ? (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isMe={msg.sender_id === currentUserId}
              currentUser={currentUser}
              isGroup={isGroup}
              onZoom={setLightboxImage}
              onRetryMessage={onRetryMessage}
              onDeleteMessage={onDeleteMessage}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 p-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1f6fb2]/15 to-[#2ec4b6]/15 text-[#1f6fb2] flex items-center justify-center text-xl shadow-xs">
              {isGroup ? <IconUsers className="w-6 h-6" /> : <IconSparkles className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                {isGroup
                  ? `Welcome to ${chatTitle}!`
                  : `Start your conversation with ${chatTitle}!`}
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                {isGroup
                  ? 'Send messages, share photos, and exchange documents with all group members in real time.'
                  : 'Direct messages, photos, and PDF documents are private and delivered in real time.'}
              </p>
            </div>
          </div>
        )}

        {/* Live typing indicator */}
        {isRecipientTyping && (
          <div className="pt-1">
            <TypingIndicator
              username={isGroup ? '' : chatTitle}
              typingUsers={typingUsers}
            />
          </div>
        )}

        <div ref={bottomAnchorRef} />
      </div>

      {/* Smart Auto-Scroll Floating Pill */}
      {showScrollBottomPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-6 px-3.5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-150 z-10"
        >
          <span>↓ New messages</span>
        </button>
      )}

      {/* Lightbox Image Zoom Modal */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="w-full max-w-4xl flex items-center justify-between p-3 text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-medium truncate max-w-xs sm:max-w-md text-white/80">
              {lightboxImage.name || 'Image Preview'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => triggerFileDownload(lightboxImage.url, lightboxImage.name || 'image.png')}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                title="Download full image"
              >
                <IconDownload className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Close (ESC)"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="relative max-w-4xl max-h-[85vh] flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name || 'Zoomed View'}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-150"
              onError={(e) => {
                const proxyUrl = getFilePreviewUrl(lightboxImage.url, lightboxImage.name);
                if (e.target.src !== proxyUrl) {
                  e.target.src = proxyUrl;
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
