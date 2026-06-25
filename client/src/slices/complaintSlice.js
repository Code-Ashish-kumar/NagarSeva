/**
 * slices/complaintSlice.js
 *
 * Manages the draft state for the multi-step complaint registration wizard.
 * Each step reads from and writes to this slice so navigating backward
 * restores prior inputs.
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  step: 0,
  // Step 1 — Images (supports multiple)
  images: [],              // Array of { previewUrl, base64, mimeType }
  // Legacy single-image accessors (derived from images[0])
  imagePreviewUrl: null,
  imageBase64: null,
  imageMimeType: null,
  // Step 2 — Location
  location: null,            // { lat, lng, address? }
  // Step 3 — Description
  description: '',
  // Step 4 — AI result
  aiResult: null,            // structured response from /api/complaints/analyze
  // Rejection flow
  isRejected: false,
  rejectionReason: null,
};

const MAX_IMAGES = 5;

const complaintSlice = createSlice({
  name: 'complaint',
  initialState,
  reducers: {
    setStep(state, action) {
      state.step = action.payload;
    },
    /** Add one or more images. payload: { previewUrl, base64, mimeType } */
    addImage(state, action) {
      if (state.images.length >= MAX_IMAGES) return;
      state.images.push(action.payload);
      // Keep legacy fields pointing to first image
      if (state.images.length === 1) {
        state.imagePreviewUrl = action.payload.previewUrl;
        state.imageBase64     = action.payload.base64;
        state.imageMimeType   = action.payload.mimeType;
      }
      // Clear any stale rejection when user adds a new image
      state.isRejected      = false;
      state.rejectionReason = null;
    },
    /** Remove image at index */
    removeImage(state, action) {
      const idx = action.payload;
      state.images.splice(idx, 1);
      // Update legacy fields
      if (state.images.length > 0) {
        state.imagePreviewUrl = state.images[0].previewUrl;
        state.imageBase64     = state.images[0].base64;
        state.imageMimeType   = state.images[0].mimeType;
      } else {
        state.imagePreviewUrl = null;
        state.imageBase64     = null;
        state.imageMimeType   = null;
      }
    },
    /** Legacy: set a single image (replaces all) */
    setImage(state, action) {
      const { imagePreviewUrl, imageBase64, imageMimeType } = action.payload;
      state.images = [{ previewUrl: imagePreviewUrl, base64: imageBase64, mimeType: imageMimeType }];
      state.imagePreviewUrl = imagePreviewUrl;
      state.imageBase64     = imageBase64;
      state.imageMimeType   = imageMimeType;
      state.isRejected      = false;
      state.rejectionReason = null;
    },
    setLocation(state, action) {
      state.location = action.payload;
    },
    setDescription(state, action) {
      state.description = action.payload;
    },
    setAiResult(state, action) {
      state.aiResult = action.payload;
    },
    setRejected(state, action) {
      state.isRejected      = true;
      state.rejectionReason = action.payload.reason;
    },
    resetComplaint() {
      return initialState;
    },
  },
});

export const {
  setStep,
  setImage,
  addImage,
  removeImage,
  setLocation,
  setDescription,
  setAiResult,
  setRejected,
  resetComplaint,
} = complaintSlice.actions;

export default complaintSlice.reducer;
