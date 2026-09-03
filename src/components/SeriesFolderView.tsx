import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Play, 
  Folder, 
  Download, 
  Film, 
  Clock, 
  Plus, 
  Calendar, 
  Tag, 
  Volume2, 
  Share2, 
  ExternalLink,
  Edit,
  X
} from 'lucide-react';
import { MediaItem, MediaEpisode, UserProfile } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';

interface SeriesFolderViewProps {
  series: MediaItem;
  currentUser: UserProfile;
  isMasterAdmin: boolean;
  isUploader: boolean;
  onBack: () => void;
  onStartWatchParty: (episode: MediaEpisode, series: MediaItem, seasonNumber: number) => void;
  onEditSeries?: (series: MediaItem) => void;
  onRequestEpisodes?: () => void;
}

export const SeriesFolderView: React.FC<SeriesFolderViewProps> = ({
  series,
  currentUser,
  isMasterAdmin,
  isUploader,
  onBack,
  onStartWatchParty,
  onEditSeries,
  onRequestEpisodes
}) => {
  const seasons = series.seasons || [];
  const [activeSeasonIndex, setActiveSeasonIndex] = useState<number>(0);
  const [showTrailerModal, setShowTrailerModal] = useState<boolean>(false);

  const currentSeason = seasons[activeSeasonIndex] || {
    seasonNumber: 1,
    seasonTitle: 'Season 1',
    episodes: []
  };

  const totalEpisodesCount = seasons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);

  // Parse YouTube trailer embed
  const getEmbedUrl = (url?: string) => {
    if (!url) return '';
    if (url.includes('youtube.com/watch?v=')) {
      const vid = url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${vid}?autoplay=1`;
    }
    if (url.includes('youtu.be/')) {
      const vid = url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${vid}?autoplay=1`;
    }
    return url;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-sans">
      
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Catalog
        </button>

        <div className="flex items-center gap-2">
          {series.trailerUrl && (
            <button
              onClick={() => setShowTrailerModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs font-semibold transition-all cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              Watch Trailer
            </button>
          )}

          {(isMasterAdmin || isUploader) && onEditSeries && (
            <button
              onClick={() => onEditSeries(series)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-xs font-semibold transition-all cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5" />
              Manage Episodes
            </button>
          )}
        </div>
      </div>

      {/* Series Hero Banner Card */}
      <LiquidGlassCard intensity="glow" className="p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          
          {/* Poster Card */}
          <div className="w-36 sm:w-44 aspect-[2/3] rounded-2xl overflow-hidden bg-slate-800 border border-white/15 shadow-2xl shrink-0 mx-auto md:mx-0 relative group">
            {series.posterUrl ? (
              <img 
                src={series.posterUrl} 
                alt={series.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-900 to-indigo-950">
                <Folder className="w-10 h-10 text-sky-400 mb-2" />
                <span className="text-xs font-bold text-slate-300 line-clamp-2">{series.title}</span>
              </div>
            )}
            
            {series.audioLang && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-mono text-sky-300 font-bold border border-white/10">
                {series.audioLang}
              </span>
            )}
          </div>

          {/* Details */}
          <div className="flex-grow space-y-3 text-left">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  {series.type === 'anime' ? '⛩️ Anime Series' : '📺 TV Series'}
                </span>
                {series.releaseYear && (
                  <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {series.releaseYear}
                  </span>
                )}
                <span className="text-xs text-slate-400 font-mono">
                  • {seasons.length} Season{seasons.length > 1 ? 's' : ''} ({totalEpisodesCount} Episodes)
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-white font-display">
                {series.title}
              </h2>
            </div>

            {series.description && (
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {series.description}
              </p>
            )}

            {/* Genres */}
            {series.genres && series.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {series.genres.map((genre, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-slate-300"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Quick action: Play Episode 1 */}
            {seasons[0]?.episodes?.[0] && (
              <div className="pt-3">
                <button
                  onClick={() => onStartWatchParty(seasons[0].episodes[0], series, 1)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-sky-500/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Watch Party (Ep 1)</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </LiquidGlassCard>

      {/* Folder Navigation: Season Selector */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {seasons.map((season, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSeasonIndex(idx)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeSeasonIndex === idx
                    ? 'bg-gradient-to-r from-sky-500/30 to-indigo-600/30 border border-sky-400 text-white shadow-lg'
                    : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Folder className="w-4 h-4 text-sky-400" />
                <span>Season {season.seasonNumber}</span>
                <span className="text-[10px] opacity-70 font-mono">({season.episodes?.length || 0})</span>
              </button>
            ))}
          </div>

          <button
            onClick={onRequestEpisodes}
            className="text-xs text-sky-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Request missing episode / season
          </button>
        </div>

        {/* Episodes Folder List */}
        {(!currentSeason.episodes || currentSeason.episodes.length === 0) ? (
          <div className="text-center py-12 bg-white/5 rounded-3xl border border-white/10 space-y-2">
            <Folder className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="text-sm font-semibold text-white">Season {currentSeason.seasonNumber} is empty</p>
            <p className="text-xs text-slate-400">Episodes have not been uploaded for this season yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentSeason.episodes.map((episode, idx) => (
              <LiquidGlassCard
                key={idx}
                intensity="glass"
                className="p-3.5 rounded-2xl flex flex-col justify-between space-y-3 group hover:border-sky-400/40 transition-all text-left"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold">
                      EPISODE {episode.episodeNumber}
                    </span>
                    {episode.duration && (
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {episode.duration}m
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors line-clamp-1 font-display">
                    {episode.title}
                  </h4>
                </div>

                {/* Episode Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onStartWatchParty(episode, series, currentSeason.seasonNumber)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Watch Party</span>
                  </button>

                  {episode.downloadUrl && (
                    <a
                      href={episode.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download for 0 MB local sync"
                      className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </LiquidGlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Trailer Modal */}
      {showTrailerModal && series.trailerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="w-full max-w-3xl relative">
            <div className="flex justify-end pb-2">
              <button
                onClick={() => setShowTrailerModal(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/15">
              <iframe
                src={getEmbedUrl(series.trailerUrl)}
                title={`${series.title} Trailer`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
