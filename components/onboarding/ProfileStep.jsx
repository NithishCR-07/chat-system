'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { IconUser, IconArrowRight, IconCheck, IconCamera, IconTrash } from '@/components/icons/Icons';
import { updateProfile, checkUsernameAvailable, uploadAvatarAction } from '@/lib/actions/profile';
import { isValidFullName, isValidUsername } from '@/lib/utils/validations';

export function ProfileStep({ onProfileSaved, initialProfile = {}, email = '', userId = null }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [fullName, setFullName] = useState(initialProfile.fullName || '');
  const [username, setUsername] = useState(
    initialProfile.username ||
      (email ? email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') : '')
  );

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(initialProfile.avatarUrl || '');
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'available' | 'taken' | 'checking'
  const [isSaving, setIsSaving] = useState(false);

  // Clean object URL on unmount/change
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

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar image must be less than 5MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPEG, PNG, WebP, etc.).');
      return;
    }

    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  }

  function handleRemoveAvatar() {
    setAvatarFile(null);
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(avatarPreview);
      } catch {
        // Handled
      }
    }
    setAvatarPreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Real-time username checking
  async function handleUsernameBlur() {
    if (!username.trim() || !isValidUsername(username)) {
      setUsernameStatus(null);
      return;
    }
    setUsernameStatus('checking');
    const res = await checkUsernameAvailable(username, userId);
    if (res.success && res.available) {
      setUsernameStatus('available');
    } else {
      setUsernameStatus('taken');
      toast.error(res.error || 'Username is already taken.');
    }
  }

  // Save profile and advance
  async function handleSaveProfile(e) {
    e.preventDefault();

    if (!isValidFullName(fullName)) {
      toast.error('Please provide your full name (2-50 characters).');
      return;
    }
    if (!isValidUsername(username)) {
      toast.error('Username must be 3-20 characters (alphanumeric, dots, underscores).');
      return;
    }
    if (usernameStatus === 'taken') {
      toast.error('Please choose an available username.');
      return;
    }

    setIsSaving(true);

    let finalAvatarUrl = avatarPreview && !avatarPreview.startsWith('blob:') ? avatarPreview : '';

    // 1. Upload avatar to public 'avatars' storage bucket if selected
    if (avatarFile) {
      try {
        const formData = new FormData();
        formData.append('file', avatarFile);
        if (userId) formData.append('userId', userId);

        const uploadRes = await uploadAvatarAction(formData);
        if (uploadRes?.success && uploadRes.avatarUrl) {
          finalAvatarUrl = uploadRes.avatarUrl;
        } else {
          toast.error(uploadRes?.error || 'Could not upload avatar. Continuing with default.');
        }
      } catch {
        toast.error('Could not upload avatar. Continuing with default.');
      }
    }

    // 2. Persist profile details
    const res = await updateProfile({
      fullName,
      username,
      avatarUrl: finalAvatarUrl,
      email: email || initialProfile.email,
      userId,
    });
    setIsSaving(false);

    if (!res.success) {
      toast.error(res.error || 'Failed to update profile.');
      return;
    }

    toast.success('Profile created successfully! Welcome aboard.');

    onProfileSaved({
      fullName,
      username,
      avatarUrl: finalAvatarUrl,
    });
  }

  const initialLetter = fullName.trim() ? fullName.trim().charAt(0).toUpperCase() : 'U';

  return (
    <div className="w-full space-y-6">
      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Set Up Your Profile</h2>
        <p className="text-xs text-slate-500">
          Upload a photo, enter your name and choose a unique username
        </p>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-5">
        {/* Hidden File Input for Avatar */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Interactive Avatar Upload Picker */}
        <div className="flex flex-col items-center justify-center space-y-2.5">
          <div className="relative group">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-3xl overflow-hidden cursor-pointer shadow-lg shadow-[#1f6fb2]/15 ring-4 ring-slate-100 hover:ring-[#1f6fb2]/30 transition-all active:scale-95 flex items-center justify-center bg-gradient-to-tr from-[#1f6fb2] to-[#2ec4b6] text-white"
              title="Click to upload profile photo"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar Preview"
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

            {/* Floating Camera Badge */}
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
                  className="text-xs font-semibold text-rose-500 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <IconTrash className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Full Name */}
        <Input
          id="fullname-input"
          label="Full Name"
          placeholder="e.g. Sarah Connor"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          icon={IconUser}
          required
          autoComplete="name"
        />

        {/* Username */}
        <div className="space-y-1">
          <Input
            id="username-input"
            label="Username (Handle)"
            placeholder="sarah.c"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''));
              setUsernameStatus(null);
            }}
            onBlur={handleUsernameBlur}
            prefix="@"
            required
            autoComplete="username"
            helperText={
              usernameStatus === 'available' ? (
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <IconCheck className="w-3.5 h-3.5" /> @{username} is available!
                </span>
              ) : usernameStatus === 'taken' ? (
                <span className="text-rose-600 font-medium">Username is already taken</span>
              ) : (
                'Your unique handle in channels and direct messages'
              )
            }
          />
        </div>

        {/* Live Chat Message Preview */}
        <div className="p-3.5 bg-gradient-to-r from-[#1f6fb2]/10 to-[#2ec4b6]/10 rounded-2xl border border-[#1f6fb2]/15 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1f6fb2] mb-2">
            Live Preview in Chat
          </p>
          <div className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-200/70 shadow-xs">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-[#1f6fb2] to-[#2ec4b6] shadow-xs shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                initialLetter
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-slate-900 truncate">
                  {fullName || 'Your Name'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  @{username || 'handle'}
                </span>
                <span className="text-[10px] text-slate-400">Just now</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                👋 Excited to start chatting!
              </p>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isSaving}
          icon={IconArrowRight}
        >
          Complete Profile
        </Button>
      </form>
    </div>
  );
}

