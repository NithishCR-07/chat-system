'use client';
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import {
  IconX,
  IconMail,
  IconAt,
  IconUser,
  IconDownload,
  IconMaximize,
  IconMessageSquare,
} from '@/components/icons/Icons';
import { triggerFileDownload } from '@/lib/storage/uploadMedia';

/**
 * Dedicated User Profile & Avatar Inspector Modal for 1:1 Direct Chats
 */
export function UserProfileModal({
  isOpen,
  onClose,
  recipient,
  isOnline = false,
  onSendMessageFocus,
}) {
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  if (!isOpen || !recipient) return null;

  const fullName = recipient.full_name || recipient.username || recipient.email?.split('@')[0] || 'User';
  const username = recipient.username ? `@${recipient.username.replace(/^@/, '')}` : '';
  const email = recipient.email || '';
  const avatarUrl = recipient.avatar_url || '';
  const initial = fullName.charAt(0).toUpperCase();

  function handleCopy(text, fieldName) {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Main Profile Card */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10 animate-in zoom-in-95 duration-150 flex flex-col"
      >
        {/* Header Cover Banner */}
        <div className="relative h-28 bg-gradient-to-r from-[#1f6fb2] via-[#248275] to-[#2ec4b6] flex items-start justify-between p-4">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/20 backdrop-blur-md text-white text-[11px] font-medium border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-white/50'
              }`}
            />
            <span>{isOnline ? 'Active Now' : 'Offline'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors cursor-pointer backdrop-blur-md"
            title="Close"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Details Container */}
        <div className="px-6 pb-6 pt-0 -mt-14 flex flex-col items-center text-center">
          {/* Circular Avatar */}
          <div className="relative group/avatar">
            <div
              className={`w-24 h-24 rounded-full shadow-xl ring-4 ring-white overflow-hidden flex items-center justify-center font-bold text-3xl text-white ${
                avatarUrl ? 'bg-slate-100 cursor-pointer' : 'bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6]'
              }`}
              onClick={() => avatarUrl && setIsPhotoZoomed(true)}
              title={avatarUrl ? 'Click to view photo' : fullName}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover/avatar:scale-105"
                />
              ) : (
                initial
              )}
            </div>

            {/* Online Status Badge */}
            <span
              className={`absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full border-[3px] border-white shadow-xs ${
                isOnline ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
              title={isOnline ? 'Online' : 'Offline'}
            />
          </div>

          {/* User Display Names */}
          <div className="mt-3 space-y-0.5">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">
              {fullName}
            </h2>
            {username && (
              <p className="text-xs font-mono font-medium text-[#1f6fb2]">
                {username}
              </p>
            )}
          </div>

          {/* Contact Details Information Card */}
          <div className="w-full mt-4 bg-slate-50/90 border border-slate-100 rounded-2xl p-3.5 space-y-2.5 text-left">
            {email && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-sky-100/80 text-[#1f6fb2] flex items-center justify-center shrink-0 shadow-2xs">
                    <IconMail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email</p>
                    <p className="text-xs text-slate-800 font-medium truncate" title={email}>
                      {email}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(email, 'email')}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#1f6fb2] hover:bg-sky-50 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  {copiedField === 'email' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            {username && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-teal-100/80 text-[#2ec4b6] flex items-center justify-center shrink-0 shadow-2xs">
                    <IconAt className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Username</p>
                    <p className="text-xs text-slate-800 font-mono truncate" title={username}>
                      {username}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(username, 'username')}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#1f6fb2] hover:bg-sky-50 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  {copiedField === 'username' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {/* Single Full-Width Message Action Button */}
          <div className="w-full mt-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onSendMessageFocus) onSendMessageFocus();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-95 shadow-md shadow-[#1f6fb2]/20 transition-all cursor-pointer active:scale-98"
            >
              <IconMessageSquare className="w-4 h-4" />
              <span>Message</span>
            </button>
          </div>
        </div>
      </div>

      {/* Full Photo Zoom Lightbox Modal */}
      {isPhotoZoomed && avatarUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsPhotoZoomed(false)}
        >
          <div
            className="w-full max-w-md flex items-center justify-between p-3 text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-semibold truncate text-white/90">
              {fullName} &apos;s Photo
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => triggerFileDownload(avatarUrl, `${fullName}_avatar.jpg`)}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                title="Download full avatar"
              >
                <IconDownload className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPhotoZoomed(false)}
                className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Close"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="relative max-w-md max-h-[80vh] flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={avatarUrl}
              alt={fullName}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150 ring-2 ring-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}
