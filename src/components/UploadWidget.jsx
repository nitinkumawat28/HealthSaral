import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

export default function UploadWidget() {
  // Local state management for drag state, selected file, and upload states
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Accepted file types and maximum 10MB size limit validation rules
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB

  // Validates file format and size limits before saving in state
  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile) return;

    if (!allowedTypes.includes(selectedFile.type)) {
      setErrorMsg('Please select a valid report file (PDF, JPG, or PNG only).');
      setStatus('error');
      setFile(null);
      return;
    }

    if (selectedFile.size > maxSizeBytes) {
      setErrorMsg('File is too large. Maximum allowed size is 10MB.');
      setStatus('error');
      setFile(null);
      return;
    }

    setErrorMsg('');
    setStatus('idle');
    setFile(selectedFile);
  };

  // Drag and drop event listeners
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Trigger file upload workflow to server API
  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    setErrorMsg('');

    try {
      // 1. Get the current active Supabase user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('You must be signed in to upload reports. Please log in again.');
      }

      // Retrieve the JWT bearer token
      const token = session.access_token;
      
      // 2. Wrap file in a FormData object for multipart upload
      const formData = new FormData();
      formData.append('reportFile', file);

      // 3. Make the API request to the backend endpoint
      const response = await fetch('/api/upload-report', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Upload failed with status code ${response.status}.`);
      }

      // 4. Update state to processing while backend completes database write
      setStatus('processing');
      await new Promise((resolve) => setTimeout(resolve, 800));

      setStatus('done');
      
      // Redirect back to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (err) {
      console.error('File upload error:', err);
      setErrorMsg(err.message || 'An unexpected network error occurred. Please try again.');
      setStatus('error');
    }
  };

  const handleCancel = () => {
    setFile(null);
    setStatus('idle');
    setErrorMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-white rounded-xl border border-[#DDE4E0] shadow-sm p-6 md:p-8">
      <h2 className="text-xl font-display font-bold text-[#16262A] mb-2 text-center">Upload Medical Report</h2>
      <p className="text-xs text-gray-500 text-center mb-6">Supported formats: PDF, JPG, PNG (Max 10MB)</p>

      {/* Feedback Alerts */}
      {status === 'error' && (
        <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
          {errorMsg}
        </div>
      )}
      {status === 'done' && (
        <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
          Upload successful! Redirecting you to your dashboard...
        </div>
      )}

      {/* Drag & Drop Area */}
      {!file && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          className={`relative group border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer ${
            isDragActive 
              ? 'border-[#D65B3E] bg-[#D65B3E]/5' 
              : 'border-[#DDE4E0] hover:border-gray-400 bg-[#F3F6F4]/40 hover:bg-[#F3F6F4]/60'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
          />
          
          <div className={`p-4 rounded-full bg-white border border-[#DDE4E0] mb-4 shadow-sm group-hover:scale-105 transition-transform duration-300 ${isDragActive ? 'border-[#D65B3E]' : ''}`}>
            <svg className={`w-6 h-6 ${isDragActive ? 'text-[#D65B3E]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <span className="text-sm font-semibold text-[#16262A] mb-1">
            Drag and drop your file here
          </span>
          <span className="text-xs text-gray-400">
            or <span className="text-[#D65B3E] underline font-medium">browse your computer</span>
          </span>
        </div>
      )}

      {/* Selected File Details & Upload Confirmation Controls */}
      {file && (
        <div className="border border-[#DDE4E0] rounded-xl p-5 bg-[#F3F6F4]/30 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white border border-[#DDE4E0] rounded-lg">
              <svg className="w-6 h-6 text-[#0F5C4C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#16262A] truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            {status === 'idle' && (
              <button 
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                title="Remove file"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {status !== 'done' && (
              <>
                <button
                  onClick={handleUpload}
                  disabled={status === 'uploading' || status === 'processing'}
                  className="flex-1 py-2.5 px-4 bg-[#D65B3E] hover:bg-[#c04f33] disabled:opacity-75 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#D65B3E] cursor-pointer"
                >
                  {status === 'uploading' && 'Uploading...'}
                  {status === 'processing' && 'Processing...'}
                  {status === 'idle' && 'Confirm Upload'}
                  {status === 'error' && 'Retry Upload'}
                </button>
                {(status === 'idle' || status === 'error') && (
                  <button
                    onClick={handleCancel}
                    className="py-2.5 px-4 bg-white hover:bg-gray-50 border border-[#DDE4E0] text-gray-700 font-semibold text-sm rounded-lg transition-all focus:outline-none cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
