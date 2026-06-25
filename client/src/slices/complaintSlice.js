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
  // Step 1 — Image
  imageFile: null,           // not serializable; stored as object URL string for redux
  imagePreviewUrl: null,     // string: object URL or data URL for preview
  imageBase64: null,         // string: pure base64 (no data-URI prefix)
  imageMimeType: null,       // string: e.g. "image/jpeg"
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

const complaintSlice = createSlice({
  name: 'complaint',
  initialState,
  reducers: {
    setStep(state, action) {
      state.step = action.payload;
    },
    setImage(state, action) {
      // payload: { imagePreviewUrl, imageBase64, imageMimeType }
      state.imagePreviewUrl = action.payload.imagePreviewUrl;
      state.imageBase64     = action.payload.imageBase64;
      state.imageMimeType   = action.payload.imageMimeType;
      // Clear any stale rejection when user picks a new image
      state.isRejected      = false;
      state.rejectionReason = null;
    },
    setLocation(state, action) {
      // payload: { lat, lng, address? }
      state.location = action.payload;
    },
    setDescription(state, action) {
      state.description = action.payload;
    },
    setAiResult(state, action) {
      state.aiResult = action.payload;
    },
    setRejected(state, action) {
      // payload: { reason: string }
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
  setLocation,
  setDescription,
  setAiResult,
  setRejected,
  resetComplaint,
} = complaintSlice.actions;

export default complaintSlice.reducer;
