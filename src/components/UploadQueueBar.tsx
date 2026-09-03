import React from 'react';
import { useUpload } from '../context/UploadContext';
import { 
  Cloud, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ChevronUp, 
  ChevronDown, 
  Film, 
  Trash2,
  Play,
  RotateCcw
} from 'lucide-react';

export const UploadQueueBar: React.FC = () => {
  const { 
    jobs, 
    activeCount, 
    isDrawerOpen, 
    setIsDrawerOpen, 
    cancelUpload, 
    clearCompleted,
    retryUpload
  } = useUpload();

  if (jobs.length === 0) {
    return null;
  }

  // Calculate overall average progress
  const activeJobs = jobs.filter(j => j.status === 'uploading' || j.status === 'publishing');
  const avgProgress = activeJobs.length > 0 
    ? Math.round(activeJobs.reduce((acc, j) => acc + j.progress, 0) / activeJobs.length)
    : 100;

  return (
    <div className="fixed bottom-4 right-4 sm:right-6 z-[9990] max-w-md w-full sm:w-[420px] pointer-events-auto select-none font-sans">
      {/* Minimized Floating Pill */}
      {!isDrawerOpen ? (
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#0d1424]/95 hover:bg-[#131d33] border border-sky-500/30 rounded-2xl shadow-2xl shadow-sky-950/60 backdrop-blur-xl transition-all hover:scale-[1.02] cursor-pointer group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300">
              {activeCount > 0 ? (
                <Upload className="w-4 h-4 animate-bounce text-sky-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
            </div>

            <div className="text-left min-w-0">
              <p className="text-xs font-bold text-white flex items-center gap-2 truncate">
                {activeCount > 0 ? (
                  <>
                    <span>Uploading {activeCount} Movie{activeCount > 1 ? 's' : ''}</span>
                    <span className="text-sky-300 font-mono text-[11px] bg-sky-500/20 px-1.5 py-0.5 rounded-md">
                      {avgProgress}%
                    </span>
                  </>
                ) : (
                  <span className="text-emerald-300">All Uploads Completed</span>
                )}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {activeJobs.length > 0 
                  ? activeJobs.map(j => j.title).join(', ')
                  : 'Click to view catalog uploads'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-sky-400 font-semibold flex items-center gap-1 group-hover:text-sky-300">
              View Queue
              <ChevronUp className="w-3.5 h-3.5" />
            </span>
          </div>
        </button>
      ) : (
        /* Expanded Drawer */
        <div className="bg-[#0b111e]/95 border border-sky-500/30 rounded-3xl shadow-2xl shadow-black/80 backdrop-blur-2xl overflow-hidden flex flex-col max-h-[550px] animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
                <Cloud className="w-3.5 h-3.5 text-sky-300" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  Movie Upload Manager
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {activeCount} Active
                  </span>
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {jobs.some(j => j.status === 'completed' || j.status === 'error') && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1"
                  title="Clear finished items"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Done</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Minimize queue"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Job List */}
          <div className="p-3 space-y-3 overflow-y-auto max-h-[380px] custom-scrollbar">
            {jobs.map(job => {
              const loadedMB = (job.loadedBytes / (1024 * 1024)).toFixed(1);
              const totalMB = (job.fileSize / (1024 * 1024)).toFixed(1);

              return (
                <div
                  key={job.id}
                  className="p-3 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl space-y-2.5 transition-all"
                >
                  {/* Title & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center shrink-0">
                        <Film className="w-3.5 h-3.5 text-indigo-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {job.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {job.fileName} • {totalMB} MB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {job.status === 'uploading' && (
                        <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/20 border border-sky-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                          {job.progress}%
                        </span>
                      )}
                      {job.status === 'publishing' && (
                        <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                          <span>Publishing...</span>
                        </span>
                      )}
                      {job.status === 'completed' && (
                        <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Live</span>
                        </span>
                      )}
                      {job.status === 'error' && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold text-rose-300 bg-rose-500/20 border border-rose-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            <span>Failed</span>
                          </span>
                          {job.file && (
                            <button
                              type="button"
                              onClick={() => retryUpload(job.id)}
                              className="px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 rounded-full flex items-center gap-1 transition-colors cursor-pointer"
                              title="Retry Upload"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Retry</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => cancelUpload(job.id)}
                            className="w-5 h-5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                            title="Dismiss"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {job.status === 'uploading' && (
                        <button
                          type="button"
                          onClick={() => cancelUpload(job.id)}
                          className="w-5 h-5 rounded-md hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Cancel upload"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
                      <div
                        className={`h-full transition-all duration-200 rounded-full ${
                          job.status === 'completed'
                            ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                            : job.status === 'error'
                            ? 'bg-rose-500'
                            : 'bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400 animate-pulse'
                        }`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>

                    {/* Progress Info Details */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>
                        {job.status === 'completed' 
                          ? `✓ ${totalMB} MB Uploaded`
                          : `${loadedMB} / ${totalMB} MB`}
                      </span>
                      {job.status === 'uploading' && (
                        <span className="text-sky-300">
                          {job.speedMBs > 0 ? `${job.speedMBs} MB/s` : 'Connecting...'}
                          {job.timeRemainingSec ? ` • ~${job.timeRemainingSec}s left` : ''}
                        </span>
                      )}
                      {job.status === 'completed' && (
                        <span className="text-emerald-400 font-sans font-medium flex items-center gap-1">
                          Ready for friends to stream
                        </span>
                      )}
                    </div>
                  </div>

                  {job.error && (
                    <p className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded-xl border border-rose-500/20">
                      {job.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
