'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect } from 'react';
import {
  IconX,
  IconUser,
  IconCamera,
  IconTrash,
  IconCheck,
  IconSpinner,
} from '@/components/icons/Icons';
import { useToast } from '@/components/ui/Toast';
import { uploadAvatarAction, removeAvatarAction, updateProfile } from '@/lib/actions/profile';
import { isValidFullName } from '@/lib/utils/validations';

export function ProfileSettingsModal({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [prevUserAvatar, setPrevUserAvatar] = useState(currentUser?.avatar_url);
  const [prevUserName, setPrevUserName] = useState(currentUser?.full_name);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state during render when currentUser changes
  if (currentUser?.avatar_url !== prevUserAvatar || currentUser?.full_name !== prevUserName) {
    setPrevUserAvatar(currentUser?.avatar_url);
    setPrevUserName(currentUser?.full_name);
    setFullName(currentUser?.full_name || '');
    setAvatarPreview(currentUser?.avatar_url || '');
    setAvatarFile(null);
  }

  // Clean local blob URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(avatarPreview);
        } catch {
          // Handled
        }
      }
    };
  }, [avatarPreview]);

  if (!isOpen) return null;

  const currentUserId = currentUser?.id;
  const userEmail = currentUser?.email || '';
  const username = currentUser?.username || '';
  const initialLetter = (fullName || currentUser?.full_name || userEmail || 'U').charAt(0).toUpperCase();

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar file size must be less than 5MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPEG, PNG, WebP, GIF).');
      return;
    }

    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  }

  async function handleRemoveAvatar() {
    if (!confirm('Are you sure you want to remove your profile photo?')) return;

    setIsUploading(true);
    try {
      const res = await removeAvatarAction({ userId: currentUserId });
      setIsUploading(false);

      if (res?.success) {
        setAvatarFile(null);
        setAvatarPreview('');
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (onProfileUpdated) {
          onProfileUpdated({
            ...currentUser,
            avatar_url: '',
          });
        }
        toast.success('Profile photo removed.');
      } else {
        toast.error(res?.error || 'Failed to remove photo.');
      }
    } catch {
      setIsUploading(false);
      toast.error('Could not remove photo.');
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();

    const cleanName = fullName.trim();
    if (!isValidFullName(cleanName)) {
      toast.error('Please enter a valid full name (2-50 characters).');
      return;
    }

    setIsSaving(true);

    let finalAvatarUrl = avatarPreview && !avatarPreview.startsWith('blob:') ? avatarPreview : currentUser?.avatar_url || '';

    // 1. Upload new photo to public 'avatars' storage bucket if selected
    if (avatarFile) {
      try {
        const formData = new FormData();
        formData.append('file', avatarFile);
        if (currentUserId) formData.append('userId', currentUserId);

        const uploadRes = await uploadAvatarAction(formData);
        if (uploadRes?.success && uploadRes.avatarUrl) {
          finalAvatarUrl = uploadRes.avatarUrl;
        } else {
          toast.error(uploadRes?.error || 'Failed to upload photo to storage.');
          setIsSaving(false);
          return;
        }
      } catch {
        toast.error('Could not upload image file.');
        setIsSaving(false);
        return;
      }
    }

    // 2. Persist updated profile in database
    const updateRes = await updateProfile({
      fullName: cleanName,
      username: username || currentUser?.username,
      avatarUrl: finalAvatarUrl,
      email: userEmail,
      userId: currentUserId,
    });

    setIsSaving(false);

    if (!updateRes?.success) {
      toast.error(updateRes?.error || 'Failed to save profile.');
      return;
    }

    const updatedUser = {
      ...currentUser,
      full_name: cleanName,
      avatar_url: finalAvatarUrl,
    };

    if (onProfileUpdated) {
      onProfileUpdated(updatedUser);
    }

    toast.success('Profile updated successfully!');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden z-10 animate-in zoom-in-95 duration-150"
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="font-bold text-base text-slate-900 leading-tight">Edit Profile</h3>
            <p className="text-xs text-slate-500">Update your photo and personal information</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isUploading}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSaveProfile} className="p-5 space-y-5">
          {/* Avatar Section */}
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="relative group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-3xl overflow-hidden cursor-pointer shadow-lg shadow-[#1f6fb2]/15 ring-4 ring-slate-100 hover:ring-[#1f6fb2]/30 transition-all active:scale-95 flex items-center justify-center bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white"
                title="Change profile photo"
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={fullName || 'Avatar'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-extrabold">{initialLetter}</span>
                )}

                {/* Hover Camera Overlay */}
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1">
                  <IconCamera className="w-6 h-6" />
                  <span className="text-[10px] font-semibold">Change</span>
                </div>
              </button>

              {/* Floating Camera Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-[#1f6fb2] shadow-md border border-slate-200/80 flex items-center justify-center hover:bg-slate-50 transition-transform active:scale-95 cursor-pointer"
                title="Upload profile picture"
              >
                <IconCamera className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-[#1f6fb2] hover:underline cursor-pointer"
              >
                {avatarPreview ? 'Change photo' : 'Upload photo'}
              </button>

              {avatarPreview && (
                <>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    className="text-xs font-semibold text-rose-500 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {isUploading ? <IconSpinner className="w-3 h-3" /> : <IconTrash className="w-3 h-3" />}
                    <span>Remove</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Full Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-slate-400">
                <IconUser className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/10 focus:bg-white outline-none transition-all"
                required
              />
            </div>
          </div>

          {/* Readonly Account Details */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Username</p>
              <p className="text-xs font-mono font-medium text-slate-700 truncate mt-0.5">
                @{username || 'user'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Email</p>
              <p className="text-xs font-medium text-slate-700 truncate mt-0.5" title={userEmail}>
                {userEmail}
              </p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isUploading}
              className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving || isUploading || !fullName.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-[#1f6fb2] to-[#2ec4b6] text-white text-xs font-semibold rounded-xl hover:opacity-95 transition-all shadow-md shadow-[#1f6fb2]/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSaving ? <IconSpinner className="w-3.5 h-3.5" /> : <IconCheck className="w-3.5 h-3.5" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
