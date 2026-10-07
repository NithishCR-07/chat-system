'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from 'react';
import {
  IconSpinner,
  IconSingleCheck,
  IconDoubleCheck,
  IconFilePdf,
  IconFileText,
  IconDownload,
  IconExternalLink,
  IconMaximize,
  IconTrash,
  IconX,
  IconUsers,
  IconBan,
} from '@/components/icons/Icons';
import {
  formatFileSize,
  triggerFileDownload,
  getFilePreviewUrl,
} from '@/lib/storage/uploadMedia';
import { getSenderColorClass } from '@/lib/chat/chatEngine';

/**
 * Modular Image Attachment Card with Skeleton & Server Proxy Fallback
 */
function ImageCard({ msg, isMe, isFailed, onZoom }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [useProxy, setUseProxy] = useState(false);

  const imgSrc = useProxy
    ? getFilePreviewUrl(msg.file_url, msg.file_name)
    : msg.file_url;

  function handleImageError() {
    if (!useProxy) {
      setUseProxy(true);
    } else {
      setHasError(true);
    }
  }

  return (
    <div
      className={`max-w-xs sm:max-w-sm md:max-w-md rounded-2xl overflow-hidden shadow-xs transition-all ${
        isMe
          ? isFailed
            ? 'bg-rose-500 text-white rounded-br-xs p-1'
            : 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white rounded-br-xs p-1'
          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs p-1'
      }`}
    >
      <div className="relative group/img overflow-hidden rounded-xl bg-slate-900/10 min-h-[140px] flex items-center justify-center">
        {/* Loading Skeleton */}
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 bg-slate-200/70 animate-pulse flex items-center justify-center">
            <IconSpinner className="w-5 h-5 text-[#1f6fb2]" />
          </div>
        )}

        {/* Fallback Display if image completely fails */}
        {hasError ? (
          <div className="p-4 flex flex-col items-center justify-center text-center space-y-2 w-full bg-slate-50">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-[#1f6fb2] flex items-center justify-center">
              <IconFileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 max-w-full px-2">
              <p
                className="text-xs font-semibold text-slate-800 truncate"
                title={msg.file_name}
              >
                {msg.file_name || 'Image File'}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                {msg.file_size ? formatFileSize(msg.file_size) : 'Image'}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                triggerFileDownload(msg.file_url, msg.file_name || 'image.png')
              }
              className="mt-1 px-3 py-1.5 rounded-lg bg-[#1f6fb2] hover:bg-[#1f6fb2]/90 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
            >
              <IconDownload className="w-3.5 h-3.5" />
              <span>Download Image</span>
            </button>
          </div>
        ) : (
          /* Normal High-Res Image */
          <img
            src={imgSrc}
            alt={msg.file_name || 'Shared Image'}
            className={`w-full max-h-72 object-cover rounded-xl cursor-pointer hover:scale-[1.02] transition-all duration-200 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setIsLoaded(true)}
            onError={handleImageError}
            onClick={() => onZoom && onZoom({ url: imgSrc, name: msg.file_name })}
            loading="lazy"
          />
        )}

        {/* Hover Overlay Controls */}
        {!hasError && isLoaded && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onZoom && onZoom({ url: imgSrc, name: msg.file_name })}
              className="w-9 h-9 rounded-full bg-white/90 text-slate-800 hover:bg-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
              title="View Fullscreen"
            >
              <IconMaximize className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerFileDownload(msg.file_url, msg.file_name || 'image.png');
              }}
              className="w-9 h-9 rounded-full bg-white/90 text-slate-800 hover:bg-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
              title="Download Image"
            >
              <IconDownload className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* File size badge */}
        {msg.file_size && !hasError ? (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono">
            {formatFileSize(msg.file_size)}
          </div>
        ) : null}
      </div>

      {/* Optional Caption */}
      {msg.content && (
        <p className="px-2.5 py-2 text-xs whitespace-pre-wrap break-words leading-relaxed">
          {msg.content}
        </p>
      )}
    </div>
  );
}

/**
 * 1. System Message Subcomponent
 */
function SystemMessage({ content }) {
  return (
    <div className="flex justify-center my-2 select-none">
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-200/80 text-slate-600 text-[11px] font-medium shadow-2xs">
        <IconUsers className="w-3 h-3 text-slate-500" />
        <span>{content}</span>
      </div>
    </div>
  );
}

/**
 * 2. Deleted Message Tombstone Subcomponent
 */
function DeletedMessage({
  isMe,
  isGroup,
  senderColor,
  senderName,
  senderInitial,
  senderAvatar,
  deleterName,
  isDeletedByMe,
  time,
}) {
  return (
    <div
      className={`flex flex-col ${
        isMe ? 'items-end' : 'items-start'
      } space-y-1 group relative my-0.5`}
    >
      {/* Sender Header for Group Incoming Deleted Messages */}
      {!isMe && isGroup && (
        <div className="flex items-center gap-1.5 pl-1 mb-0.5">
          <span className={`text-[11px] font-bold ${senderColor}`}>
            {senderName}
          </span>
        </div>
      )}

      <div
        className={`relative flex items-end gap-2 ${
          isMe ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Sender Avatar for Group incoming messages */}
        {!isMe && isGroup && (
          <div className="w-6 h-6 rounded-lg bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-[10px] shrink-0 mb-1 shadow-2xs overflow-hidden">
            {senderAvatar ? (
              <img
                src={senderAvatar}
                alt={senderName}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              senderInitial
            )}
          </div>
        )}

        {/* Modern Cohesive Deleted Message Tombstone Card */}
        <div
          className={`max-w-md px-3.5 py-2 rounded-2xl shadow-2xs flex items-center gap-2.5 border transition-all select-none ${
            isMe
              ? 'bg-slate-100/90 hover:bg-slate-100 text-slate-600 border-slate-200/90 rounded-br-xs'
              : 'bg-white hover:bg-slate-50/80 text-slate-600 border-slate-200 rounded-bl-xs'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
              isMe ? 'bg-slate-200/80 text-slate-500' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <IconBan className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs text-slate-600 font-normal leading-snug">
            This message was deleted by{' '}
            <span className="font-semibold text-slate-900">{deleterName}</span>
            {isDeletedByMe && (
              <span className="text-[#1f6fb2] font-medium ml-1">(You)</span>
            )}
          </span>
          {time && (
            <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2 self-center">
              {time}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Normal Active Message Subcomponent
 */
function NormalMessage({
  msg,
  isMe,
  isGroup,
  senderName,
  senderInitial,
  senderColor,
  senderAvatar,
  time,
  isFailed,
  isSending,
  isImage,
  isPdf,
  isFile,
  showConfirmDelete,
  isDeleting,
  onZoom,
  onRetryMessage,
  onDeleteTrigger,
  onConfirmDelete,
  onCancelDelete,
}) {
  return (
    <div
      className={`flex flex-col ${
        isMe ? 'items-end' : 'items-start'
      } space-y-1 group relative`}
    >
      {/* Sender Header for Group Incoming Messages */}
      {!isMe && isGroup && (
        <div className="flex items-center gap-1.5 pl-1 mb-0.5">
          <span className={`text-[11px] font-bold ${senderColor}`}>
            {senderName}
          </span>
        </div>
      )}

      <div
        className={`relative flex items-end gap-2 ${
          isMe ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Sender Avatar for Group incoming messages */}
        {!isMe && isGroup && (
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mb-1 shadow-2xs overflow-hidden">
            {senderAvatar ? (
              <img
                src={senderAvatar}
                alt={senderName}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              senderInitial
            )}
          </div>
        )}

        {/* Main Content Bubble */}
        {isImage && msg.file_url ? (
          <ImageCard
            msg={msg}
            isMe={isMe}
            isFailed={isFailed}
            onZoom={onZoom}
          />
        ) : isPdf && msg.file_url ? (
          /* PDF Document Card */
          <div
            className={`max-w-xs sm:max-w-sm md:max-w-md rounded-2xl p-3 shadow-xs transition-all ${
              isMe
                ? isFailed
                  ? 'bg-rose-500 text-white rounded-br-xs'
                  : 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white rounded-br-xs'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isMe
                    ? 'bg-white/20 text-white'
                    : 'bg-rose-50 text-rose-600 border border-rose-100'
                }`}
              >
                <IconFilePdf className="w-6 h-6" />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold truncate leading-tight"
                  title={msg.file_name}
                >
                  {msg.file_name || 'Document.pdf'}
                </p>
                <p
                  className={`text-[10px] font-mono mt-0.5 ${
                    isMe ? 'text-white/80' : 'text-slate-400'
                  }`}
                >
                  {isSending && msg.uploadProgress !== undefined
                    ? `Uploading ${msg.uploadProgress}%`
                    : msg.file_size
                    ? formatFileSize(msg.file_size)
                    : 'PDF Document'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={getFilePreviewUrl(msg.file_url, msg.file_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isMe
                      ? 'hover:bg-white/20 text-white'
                      : 'hover:bg-slate-100 text-slate-500'
                  }`}
                  title="Open in new tab"
                >
                  <IconExternalLink className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFileDownload(
                      msg.file_url,
                      msg.file_name || 'document.pdf'
                    );
                  }}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isMe
                      ? 'hover:bg-white/20 text-white'
                      : 'hover:bg-slate-100 text-[#1f6fb2]'
                  }`}
                  title="Download PDF"
                >
                  <IconDownload className="w-4 h-4" />
                </button>
              </div>
            </div>

            {msg.content && (
              <p
                className={`mt-2 pt-2 border-t text-xs whitespace-pre-wrap break-words leading-relaxed ${
                  isMe ? 'border-white/20' : 'border-slate-100'
                }`}
              >
                {msg.content}
              </p>
            )}
          </div>
        ) : isFile && msg.file_url ? (
          /* General Document Card */
          <div
            className={`max-w-xs sm:max-w-sm md:max-w-md rounded-2xl p-3 shadow-xs transition-all ${
              isMe
                ? isFailed
                  ? 'bg-rose-500 text-white rounded-br-xs'
                  : 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white rounded-br-xs'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isMe
                    ? 'bg-white/20 text-white'
                    : 'bg-sky-50 text-[#1f6fb2] border border-sky-100'
                }`}
              >
                <IconFileText className="w-6 h-6" />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold truncate leading-tight"
                  title={msg.file_name}
                >
                  {msg.file_name || 'Attachment'}
                </p>
                <p
                  className={`text-[10px] font-mono mt-0.5 ${
                    isMe ? 'text-white/80' : 'text-slate-400'
                  }`}
                >
                  {isSending && msg.uploadProgress !== undefined
                    ? `Uploading ${msg.uploadProgress}%`
                    : msg.file_size
                    ? formatFileSize(msg.file_size)
                    : 'File'}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFileDownload(msg.file_url, msg.file_name || 'file');
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  isMe
                    ? 'hover:bg-white/20 text-white'
                    : 'hover:bg-slate-100 text-[#1f6fb2]'
                }`}
                title="Download File"
              >
                <IconDownload className="w-4 h-4" />
              </button>
            </div>

            {msg.content && (
              <p
                className={`mt-2 pt-2 border-t text-xs whitespace-pre-wrap break-words leading-relaxed ${
                  isMe ? 'border-white/20' : 'border-slate-100'
                }`}
              >
                {msg.content}
              </p>
            )}
          </div>
        ) : (
          /* Standard Text Bubble */
          <div
            className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs transition-opacity ${
              isMe
                ? isFailed
                  ? 'bg-rose-500 text-white rounded-br-xs'
                  : isSending
                  ? 'bg-gradient-to-r from-[#1f6fb2]/80 to-[#2ec4b6]/80 text-white rounded-br-xs opacity-85'
                  : 'bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white rounded-br-xs'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        )}

        {/* Delete Action Trigger (Visible on mobile/tablets, hover on desktop) */}
        {isMe && !isSending && !showConfirmDelete && (
          <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-150 shrink-0 self-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTrigger();
              }}
              className="p-1.5 rounded-lg bg-slate-100/90 hover:bg-rose-50 text-slate-400 hover:text-rose-600 active:text-rose-600 transition-colors shadow-2xs cursor-pointer active:scale-90 touch-manipulation"
              title="Delete message"
              aria-label="Delete message"
            >
              <IconTrash className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Inline Confirmation Popover: Delete for everyone? */}
        {showConfirmDelete && (
          <div
            className="absolute top-0 right-0 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-2 md:p-2.5 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150 max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[11px] font-medium text-slate-700 whitespace-nowrap">
              Delete message?
            </span>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onConfirmDelete}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50 touch-manipulation"
            >
              {isDeleting ? (
                <IconSpinner className="w-3 h-3" />
              ) : (
                <span>Delete</span>
              )}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors touch-manipulation"
              title="Cancel"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Meta info & Delivery status */}
      <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400 font-mono">
        {time && <span>{time}</span>}
        {isMe && (
          <>
            {isSending && (
              <span
                className="flex items-center gap-1 text-slate-400 font-sans font-medium text-[10px]"
                title={msg.uploadProgress !== undefined ? `Uploading ${msg.uploadProgress}%` : 'Sending...'}
              >
                <IconSpinner className="w-2.5 h-2.5 text-[#1f6fb2]" />
                {msg.uploadProgress !== undefined && (
                  <span>{msg.uploadProgress}%</span>
                )}
              </span>
            )}
            {isFailed && (
              <button
                type="button"
                onClick={() => onRetryMessage && onRetryMessage(msg)}
                className="text-rose-500 hover:text-rose-700 font-sans font-semibold cursor-pointer underline flex items-center gap-0.5"
                title="Click to retry"
              >
                Failed (Retry)
              </button>
            )}
            {!isSending && !isFailed && (
              msg.is_read_by_all || msg.is_read ? (
                <span
                  className="inline-flex items-center text-[#0284c7] font-bold"
                  title={
                    isGroup && msg.read_count !== undefined
                      ? `Read by all members (${msg.read_count}/${msg.total_recipients})`
                      : 'Seen by recipient'
                  }
                >
                  <IconDoubleCheck className="w-3.5 h-3.5 text-[#0284c7] drop-shadow-[0_0_2px_rgba(2,132,199,0.3)]" />
                </span>
              ) : msg.read_count && msg.read_count > 0 ? (
                <span
                  className="inline-flex items-center text-[#0284c7]"
                  title={`Read by ${msg.read_count} of ${msg.total_recipients} members`}
                >
                  <IconDoubleCheck className="w-3.5 h-3.5 text-[#0284c7]/70" />
                </span>
              ) : (
                <span
                  className="inline-flex items-center text-slate-400"
                  title="Delivered"
                >
                  <IconSingleCheck className="w-3.5 h-3.5 text-slate-400" />
                </span>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Dedicated Message Item Component
 * Architecture:
 * 1. Top-Level Hooks Declaration (Unconditional)
 * 2. Explicit State & Prop Calculations (isDeleted, system, etc.)
 * 3. Structured Branching:
 *    ├── SystemMessage
 *    ├── DeletedMessage
 *    └── NormalMessage
 */
export function MessageItem({
  msg,
  isMe,
  currentUser,
  isGroup = false,
  onZoom,
  onRetryMessage,
  onDeleteMessage,
}) {
  // 1. ALL Hooks declared unconditionally at the very top of the component
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close confirmation popover on mobile/desktop when clicking outside
  useEffect(() => {
    if (!showConfirmDelete) return;
    function handleOutsideClick() {
      setShowConfirmDelete(false);
    }
    const timer = setTimeout(() => {
      window.addEventListener('click', handleOutsideClick);
      window.addEventListener('touchend', handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('touchend', handleOutsideClick);
    };
  }, [showConfirmDelete]);

  const handleConfirmDelete = useCallback(async () => {
    if (!onDeleteMessage) return;
    setIsDeleting(true);
    try {
      await onDeleteMessage(msg.id);
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  }, [msg.id, onDeleteMessage]);

  // 2. Calculations (isDeleted, isSystem, Sender metadata)
  const isSystem = msg.message_type === 'system';
  const isFailed = msg.status === 'failed';
  const isSending = msg.status === 'sending';

  const isImage =
    msg.message_type === 'image' ||
    Boolean(msg.file_url && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(msg.file_name || ''));
  const isPdf =
    msg.message_type === 'pdf' ||
    Boolean(msg.file_url && /\.pdf$/i.test(msg.file_name || ''));
  const isFile = Boolean(msg.file_url) && !isImage && !isPdf;

  const isMessageDeleted = Boolean(
    msg.is_deleted === true ||
    Boolean(msg.deleted_at) ||
    (!isSystem && !isSending && !isFailed && !msg.content?.trim() && !msg.file_url)
  );

  const senderName = msg.sender?.full_name || msg.sender?.username || 'Member';
  const senderInitial = senderName.charAt(0).toUpperCase();
  const senderColor = getSenderColorClass(msg.sender_id || '');
  const senderAvatar = msg.sender?.avatar_url || '';
  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const isDeletedByMe = Boolean(
    (msg.deleted_by && currentUser?.id && msg.deleted_by === currentUser.id) ||
    (!msg.deleted_by && isMe)
  );

  const myDisplayName =
    currentUser?.full_name ||
    currentUser?.username ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
    'You';

  const otherDeleterName =
    msg.deleted_by_profile?.full_name ||
    msg.deleted_by_profile?.username ||
    (msg.deleted_by_profile?.email ? msg.deleted_by_profile.email.split('@')[0] : '') ||
    msg.sender?.full_name ||
    msg.sender?.username ||
    (msg.sender?.email ? msg.sender.email.split('@')[0] : '') ||
    senderName;

  const deleterName = isDeletedByMe ? myDisplayName : otherDeleterName;

  // 3. Conditional Rendering Architecture
  // Branch A: System Messages
  if (isSystem) {
    return <SystemMessage content={msg.content} />;
  }

  // Branch B: Deleted Messages
  if (isMessageDeleted) {
    return (
      <DeletedMessage
        isMe={isMe}
        isGroup={isGroup}
        senderColor={senderColor}
        senderName={senderName}
        senderInitial={senderInitial}
        senderAvatar={senderAvatar}
        deleterName={deleterName}
        isDeletedByMe={isDeletedByMe}
        time={time}
      />
    );
  }

  // Branch C: Normal Active Messages
  return (
    <NormalMessage
      msg={msg}
      isMe={isMe}
      isGroup={isGroup}
      senderName={senderName}
      senderInitial={senderInitial}
      senderColor={senderColor}
      senderAvatar={senderAvatar}
      time={time}
      isFailed={isFailed}
      isSending={isSending}
      isImage={isImage}
      isPdf={isPdf}
      isFile={isFile}
      showConfirmDelete={showConfirmDelete}
      isDeleting={isDeleting}
      onZoom={onZoom}
      onRetryMessage={onRetryMessage}
      onDeleteTrigger={() => setShowConfirmDelete(true)}
      onConfirmDelete={handleConfirmDelete}
      onCancelDelete={() => setShowConfirmDelete(false)}
    />
  );
}
