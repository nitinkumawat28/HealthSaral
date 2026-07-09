import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * ReportResult React Component
 * 
 * Displays the status and results of a health report analysis.
 * - Handles authentication verification.
 * - Polls Supabase if status is 'processing' until the backend finishes analysis.
 * - Renders high-fidelity clinical cards for biomarkers, summary, and action plan.
 * - Integrates nicely with the app's styling and theme modes.
 */
export default function ReportResult({ reportId }) {
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'processing' | 'done' | 'failed' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [activeMarkerIndex, setActiveMarkerIndex] = useState(0);

  // Helper function to fetch the latest report record from Supabase
  const fetchReportData = async (token) => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Report not found.');
      }

      setReport(data);

      if (data.status === 'done') {
        setStatus('done');
      } else if (data.status === 'failed') {
        setStatus('failed');
      } else {
        setStatus('processing');
      }
    } catch (err) {
      console.error('Error loading report:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Access denied or report not found.');
    }
  };

  // Run session check, fetch data, and trigger background processing on mount
  useEffect(() => {
    let sessionToken = '';
    
    const initialize = async () => {
      // 1. Verify user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Redirect to login page if user is not authenticated
        window.location.href = `/login?redirect=/report/${reportId}`;
        return;
      }
      
      sessionToken = session.access_token;
      
      // 2. Fetch the report row
      await fetchReportData(sessionToken);

      // 3. Trigger processing and await response for instant UI update
      try {
        const response = await fetch('/api/process-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
          },
          body: JSON.stringify({ reportId })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'done') {
            setReport(prev => prev ? { ...prev, status: 'done', ai_result: data.result } : null);
            setStatus('done');
            return;
          } else if (data.status === 'failed') {
            setStatus('failed');
            return;
          }
        }
      } catch (e) {
        console.error('Processing trigger error:', e);
      }
    };
 
    initialize();
  }, [reportId]);
 
  // Polling loop fallback: If status is 'processing', poll Supabase every 2 seconds
  useEffect(() => {
    let intervalId;
 
    if (status === 'processing') {
      intervalId = setInterval(async () => {
        const { data, error } = await supabase
          .from('reports')
          .select('*')
          .eq('id', reportId)
          .single();
 
        if (!error && data) {
          setReport(data);
          if (data.status === 'done') {
            setStatus('done');
            clearInterval(intervalId);
          } else if (data.status === 'failed') {
            setStatus('failed');
            clearInterval(intervalId);
          }
        }
      }, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [status, reportId]);

  // Render badge class depending on marker status
  const getStatusBadgeClass = (statusStr) => {
    const s = statusStr?.toLowerCase() || '';
    if (s.includes('normal') || s.includes('optimal')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30';
    }
    if (s.includes('high') || s.includes('low') || s.includes('moderate')) {
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30';
    }
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30';
  };

  // State A: Initial Loading / Session verification
  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-muted font-sans">Verifying security session...</p>
      </div>
    );
  }

  // State B: Polling / Processing Loop
  if (status === 'processing') {
    return (
      <div className="w-full max-w-xl mx-auto bg-canvas border border-hairline rounded-2xl p-8 text-center space-y-6 shadow-sm">
        <div className="relative w-16 h-16 mx-auto">
          {/* Pulsing radar circles */}
          <div className="absolute inset-0 bg-accent/20 rounded-full animate-ping"></div>
          <div className="relative w-16 h-16 bg-accent/10 border border-accent/20 rounded-full flex items-center justify-center text-accent">
            <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-display font-bold text-primary">Interpreting Your Lab Report</h3>
          <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">
            Our clinical AI is translating medical marker ranges into clear language. This typically takes 5 to 10 seconds.
          </p>
        </div>
        <div className="pt-2">
          <div className="w-48 h-1.5 bg-canvas-soft border border-hairline rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-accent rounded-full w-2/3 animate-[shimmer_1.5s_infinite] origin-left"></div>
          </div>
        </div>
      </div>
    );
  }

  // State C: API or access permission error
  if (status === 'error') {
    return (
      <div className="w-full max-w-md mx-auto bg-canvas border border-hairline rounded-2xl p-8 text-center space-y-6 shadow-sm">
        <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-full flex items-center justify-center text-rose-600 mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-display font-bold text-primary">Unable to Load Report</h3>
          <p className="text-sm text-muted leading-relaxed">{errorMsg}</p>
        </div>
        <div className="flex flex-col gap-3">
          <a
            href="/"
            className="py-2.5 px-4 bg-accent hover:bg-accent/90 text-white font-semibold text-sm rounded-lg transition-all text-center"
          >
            Upload a Report
          </a>
          <a href="/dashboard" className="text-xs font-semibold text-muted hover:text-primary transition-colors text-center">
            View All Reports
          </a>
        </div>
      </div>
    );
  }

  // State D: Server execution failure
  if (status === 'failed') {
    return (
      <div className="w-full max-w-md mx-auto bg-canvas border border-hairline rounded-2xl p-8 text-center space-y-6 shadow-sm">
        <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-full flex items-center justify-center text-rose-600 mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-display font-bold text-primary">Interpretation Failed</h3>
          <p className="text-sm text-muted leading-relaxed">
            The AI was unable to parse this report file. Please verify the document is a readable medical report and try again.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <a
            href="/"
            className="py-2.5 px-4 bg-accent hover:bg-accent/90 text-white font-semibold text-sm rounded-lg transition-all text-center"
          >
            Try Uploading Again
          </a>
          <a href="/dashboard" className="text-xs font-semibold text-muted hover:text-primary transition-colors text-center">
            View All Reports
          </a>
        </div>
      </div>
    );
  }

  // Extract structured AI results safely
  const data = report.ai_result || {};
  const markers = data.markers || [];
  const summary = data.summary || 'No summary overview provided.';
  const actionPlan = data.action_plan || [];

  return (
    <div className="space-y-8 animate-[fadeIn_0.4s_ease-out]">
      
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <div>
          <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-[10px] font-mono rounded-full uppercase tracking-wider mb-2 inline-block">
            Demystified Analysis
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary">
            {data.report_type || 'Lab Analysis Results'}
          </h1>
        </div>
        
        {/* Navigation back to all dashboard reports */}
        <a 
          href="/dashboard" 
          className="text-xs sm:text-sm font-sans font-semibold text-muted hover:text-primary hover:underline transition-all flex items-center gap-1 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          View all reports
        </a>
      </div>

      {/* Main Analysis Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Biomarker Range Table (Grid List) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-hairline">
              <h3 className="text-base font-display font-bold text-primary">Detected Biomarkers</h3>
              <p className="text-xs text-muted">Click any biomarker to see a plain-language explanation.</p>
            </div>
            
            <div className="border border-hairline m-4 rounded-lg overflow-hidden bg-canvas-soft">
              <div className="grid grid-cols-3 px-4 py-2 border-b border-hairline bg-primary/5 text-[10px] font-mono text-muted uppercase tracking-wider">
                <div>Biomarker</div>
                <div className="text-right">Your Value</div>
                <div className="text-center">Status</div>
              </div>
              
              <div className="divide-y divide-hairline">
                {markers.length > 0 ? (
                  markers.map((marker, index) => (
                    <div 
                      key={index} 
                      onClick={() => setActiveMarkerIndex(index)}
                      className={`grid grid-cols-3 px-4 py-3 items-center text-xs sm:text-sm transition-all cursor-pointer ${
                        activeMarkerIndex === index 
                          ? 'bg-accent/5 font-semibold border-l-2 border-l-accent' 
                          : 'hover:bg-canvas-soft-2'
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-ink block leading-tight">{marker.name}</span>
                      </div>
                      <div className="text-right font-mono font-medium text-ink">
                        {marker.value}
                      </div>
                      <div className="flex justify-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium border ${getStatusBadgeClass(marker.status)}`}>
                          {marker.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-5 text-center text-xs text-muted">No biomarkers found.</div>
                )}
              </div>
            </div>
          </div>

          {/* Marker Detail Explanation Panel (Interactive) */}
          {markers[activeMarkerIndex] && (
            <div className="bg-canvas border border-hairline rounded-xl p-5 md:p-6 shadow-sm border-l-4 border-l-accent animate-[fadeIn_0.2s_ease-out]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-mono text-muted uppercase tracking-wider">Biomarker Spotlight</h4>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${getStatusBadgeClass(markers[activeMarkerIndex].status)}`}>
                  {markers[activeMarkerIndex].status}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-display font-bold text-primary mb-3">
                {markers[activeMarkerIndex].name} — {markers[activeMarkerIndex].value}
              </h3>
              <p className="text-sm text-ink leading-relaxed font-sans text-pretty">
                {markers[activeMarkerIndex].explanation}
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Empathetic Summary & Action Checklist */}
        <div className="space-y-6">
          
          {/* Overview / Clinical Summary Card */}
          <div className="bg-canvas border border-hairline rounded-xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-4 right-4 text-primary opacity-10">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" />
              </svg>
            </div>
            <h4 className="text-xs font-mono text-muted uppercase tracking-wider mb-2">Clinical Explanation</h4>
            <p className="text-sm text-ink leading-relaxed font-sans text-pretty">
              {summary}
            </p>
          </div>

          {/* Action Plan Card */}
          <div className="bg-canvas border border-hairline rounded-xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-4 right-4 text-accent opacity-10">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h4 className="text-xs font-mono text-muted uppercase tracking-wider mb-3">Health Action Plan</h4>
            <ul className="space-y-3 text-sm text-ink" role="list">
              {actionPlan.length > 0 ? (
                actionPlan.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0"></span>
                    <span className="leading-snug">{action}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted">No specific diet/lifestyle actions suggested. Consult your doctor.</li>
              )}
            </ul>
          </div>
          
        </div>

      </div>
    </div>
  );
}
