import React, { useState, useEffect } from 'react';
import {
  Image,
  Plus,
  ArrowLeft,
  Trash2,
  UploadCloud,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import styles from './Gallery.module.css';

interface GalleryAlbum {
  id: string;
  title: string;
  description: string;
  cover_image_url: string;
  is_public: boolean;
  category: string;
  creator_name: string;
  media_count: number;
  created_at: string;
}

interface GalleryMedia {
  id: string;
  album_id: string;
  title: string;
  caption: string;
  media_type: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  url: string;
}

interface AlbumDetail extends GalleryAlbum {
  media: GalleryMedia[];
}

const CATEGORIES = [
  { id: 'all', label: 'All Photos' },
  { id: 'events', label: 'School Events' },
  { id: 'sports', label: 'Sports & Athletics' },
  { id: 'campus', label: 'Campus & Facilities' },
  { id: 'annual_day', label: 'Annual Day' },
  { id: 'achievements', label: 'Student Achievements' },
  { id: 'other', label: 'Other Activities' }
];

const Gallery: React.FC = () => {
  const { user } = useAuth();
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [, setLoading] = useState<boolean>(true);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumDetail | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Form states
  const [newAlbum, setNewAlbum] = useState({
    title: '',
    description: '',
    category: 'events',
    is_public: true
  });

  const [uploadData, setUploadData] = useState({
    title: '',
    caption: '',
    file_name: '',
    mime_type: 'image/jpeg',
    file_data: '',
    preview_url: ''
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  const canManage = user?.role && ['super_admin', 'principal', 'teacher', 'office_staff'].includes(user.role);

  useEffect(() => {
    fetchAlbums();
  }, [user]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchAlbums = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/gallery/albums');
      if (res.data?.success) {
        setAlbums(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load gallery albums:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlbumDetail = async (albumId: string) => {
    try {
      const res = await apiClient.get(`/gallery/albums/${albumId}`);
      if (res.data?.success) {
        setSelectedAlbum(res.data.data);
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to load album');
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await apiClient.post('/gallery/albums', newAlbum);
      if (res.data?.success) {
        showNotice('success', 'Album created successfully');
        setShowCreateModal(false);
        setNewAlbum({ title: '', description: '', category: 'events', is_public: true });
        fetchAlbums();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to create album');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotice('error', 'Only image files are supported in this album');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadData({
        ...uploadData,
        file_name: file.name,
        mime_type: file.type,
        file_data: result,
        preview_url: result,
        title: uploadData.title || file.name.replace(/\.[^/.]+$/, '')
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlbum || !uploadData.file_data) return;

    try {
      setSubmitting(true);
      const payload = {
        album_id: selectedAlbum.id,
        title: uploadData.title,
        caption: uploadData.caption,
        file_name: uploadData.file_name,
        mime_type: uploadData.mime_type,
        file_data: uploadData.file_data
      };

      const res = await apiClient.post('/gallery/media', payload);
      if (res.data?.success) {
        showNotice('success', 'Photo added to album');
        setShowUploadModal(false);
        setUploadData({
          title: '',
          caption: '',
          file_name: '',
          mime_type: 'image/jpeg',
          file_data: '',
          preview_url: ''
        });
        fetchAlbumDetail(selectedAlbum.id);
        fetchAlbums();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!selectedAlbum) return;
    if (!window.confirm(`Are you sure you want to delete album "${selectedAlbum.title}" and all its photos?`)) return;

    try {
      const res = await apiClient.delete(`/gallery/albums/${selectedAlbum.id}`);
      if (res.data?.success) {
        showNotice('success', 'Album deleted');
        setSelectedAlbum(null);
        fetchAlbums();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to delete album');
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!selectedAlbum) return;
    if (!window.confirm('Delete this photo from the album?')) return;

    try {
      const res = await apiClient.delete(`/gallery/media/${mediaId}`);
      if (res.data?.success) {
        showNotice('success', 'Photo removed');
        setLightboxIndex(null);
        fetchAlbumDetail(selectedAlbum.id);
        fetchAlbums();
      }
    } catch (err: any) {
      showNotice('error', err.response?.data?.message || 'Failed to remove photo');
    }
  };

  const filteredAlbums = albums.filter((alb) => {
    if (selectedCategory === 'all') return true;
    return alb.category === selectedCategory;
  });

  return (
    <div className={styles.container}>
      {/* Notifications */}
      {message && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.875rem 1.25rem',
            borderRadius: '0.5rem',
            background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`
          }}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main View: Album Directory or Album Detail */}
      {!selectedAlbum ? (
        <>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.titleArea}>
              <h1>School Photo Gallery & Media</h1>
              <p>Explore memories, cultural festivals, sports days, and campus life.</p>
            </div>

            {canManage && (
              <div className={styles.headerActions}>
                <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} /> Create Album
                </button>
              </div>
            )}
          </div>

          {/* Filter Bar */}
          <div className={styles.filterBar}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`${styles.categoryPill} ${
                  selectedCategory === cat.id ? styles.activePill : ''
                }`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Albums Grid */}
          <div className={styles.albumsGrid}>
            {filteredAlbums.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                No albums found in this category. Click "+ Create Album" to publish your first collection.
              </div>
            ) : (
              filteredAlbums.map((alb) => (
                <div
                  key={alb.id}
                  className={styles.albumCard}
                  onClick={() => fetchAlbumDetail(alb.id)}
                >
                  <div className={styles.coverWrapper}>
                    {alb.cover_image_url ? (
                      <img
                        src={alb.cover_image_url}
                        alt={alb.title}
                        className={styles.coverImg}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.coverPlaceholder}>
                        <Image size={36} />
                        <span style={{ fontSize: '0.8rem' }}>No Cover Photo</span>
                      </div>
                    )}
                    <span className={styles.albumBadge}>{alb.category}</span>
                    <div className={styles.photoCountBadge}>
                      <Image size={13} /> {alb.media_count} photo(s)
                    </div>
                  </div>

                  <div className={styles.albumCardContent}>
                    <h3>{alb.title}</h3>
                    <p>{alb.description || 'No description provided.'}</p>

                    <div className={styles.albumCardFooter}>
                      <span>By {alb.creator_name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {alb.is_public ? <Globe size={13} /> : <Lock size={13} />}
                        <span>{new Date(alb.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* Album Detail View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className={styles.detailHeader}>
            <div className={styles.detailTitleArea}>
              <button className={styles.backBtn} onClick={() => setSelectedAlbum(null)}>
                <ArrowLeft size={16} /> Back to Albums
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{selectedAlbum.title}</h1>
                <span className={styles.albumBadge} style={{ position: 'static' }}>
                  {selectedAlbum.category}
                </span>
                {selectedAlbum.is_public ? (
                  <span style={{ fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Globe size={14} /> Public
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Lock size={14} /> Staff Only
                  </span>
                )}
              </div>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                {selectedAlbum.description || 'No description available for this album.'}
              </p>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Created by {selectedAlbum.creator_name} • {selectedAlbum.media?.length || 0} photos
              </span>
            </div>

            {canManage && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className={styles.btnPrimary} onClick={() => setShowUploadModal(true)}>
                  <UploadCloud size={16} /> Add Photos
                </button>
                <button className={styles.btnDanger} onClick={handleDeleteAlbum}>
                  <Trash2 size={16} /> Delete Album
                </button>
              </div>
            )}
          </div>

          {/* Photos Grid */}
          <div className={styles.mediaGrid}>
            {selectedAlbum.media && selectedAlbum.media.length > 0 ? (
              selectedAlbum.media.map((item, index) => (
                <div
                  key={item.id}
                  className={styles.mediaItem}
                  onClick={() => setLightboxIndex(index)}
                >
                  <img src={item.url} alt={item.title} loading="lazy" />
                  <div className={styles.mediaItemOverlay}>
                    <span className={styles.mediaItemTitle}>{item.title}</span>
                    {item.caption && (
                      <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>{item.caption}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                This album is currently empty. Click "Add Photos" to upload pictures.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE ALBUM */}
      {showCreateModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2>Create New Album</h2>
              <button className={styles.closeModalBtn} onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateAlbum}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Album Title *</label>
                  <input
                    type="text"
                    required
                    className={styles.formInput}
                    placeholder="e.g. Annual Sports Meet 2026"
                    value={newAlbum.title}
                    onChange={(e) => setNewAlbum({ ...newAlbum, title: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Category *</label>
                  <select
                    className={styles.formSelect}
                    value={newAlbum.category}
                    onChange={(e) => setNewAlbum({ ...newAlbum, category: e.target.value })}
                  >
                    <option value="events">School Events</option>
                    <option value="sports">Sports & Athletics</option>
                    <option value="campus">Campus & Facilities</option>
                    <option value="annual_day">Annual Day</option>
                    <option value="achievements">Student Achievements</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Description</label>
                  <textarea
                    rows={3}
                    className={styles.formTextarea}
                    placeholder="Brief description of the event or activity..."
                    value={newAlbum.description}
                    onChange={(e) => setNewAlbum({ ...newAlbum, description: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newAlbum.is_public}
                      onChange={(e) => setNewAlbum({ ...newAlbum, is_public: e.target.checked })}
                    />
                    <span>Make Album Public (visible to students, parents, and public visitors)</span>
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Create Album'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD PHOTO */}
      {showUploadModal && selectedAlbum && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2>Add Photo to "{selectedAlbum.title}"</h2>
              <button className={styles.closeModalBtn} onClick={() => setShowUploadModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUploadPhoto}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Select Photo *</label>
                  <label className={styles.dropzone}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />
                    <UploadCloud size={32} color="#4f46e5" />
                    <span style={{ fontWeight: 600 }}>Click or Drag image file here</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>PNG, JPG, JPEG, GIF, WEBP up to 10MB</span>
                  </label>
                </div>

                {uploadData.preview_url && (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={uploadData.preview_url}
                      alt="Preview"
                      style={{ maxHeight: '180px', borderRadius: '0.375rem', objectFit: 'contain' }}
                    />
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {uploadData.file_name}
                    </div>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label>Photo Title</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Short title for photo"
                    value={uploadData.title}
                    onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Caption / Notes</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. Finals of the Inter-house Relay"
                    value={uploadData.caption}
                    onChange={(e) => setUploadData({ ...uploadData, caption: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={submitting || !uploadData.file_data}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Upload Photo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX VIEWER */}
      {lightboxIndex !== null && selectedAlbum?.media && selectedAlbum.media[lightboxIndex] && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxIndex(null)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.lightboxCloseBtn}
              onClick={() => setLightboxIndex(null)}
              title="Close"
            >
              <X size={28} />
            </button>

            {/* Previous Photo */}
            {lightboxIndex > 0 && (
              <button
                className={`${styles.lightboxNavBtn} ${styles.lightboxPrev}`}
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                title="Previous photo"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {/* Current Image */}
            <img
              src={selectedAlbum.media[lightboxIndex].url}
              alt={selectedAlbum.media[lightboxIndex].title}
              className={styles.lightboxImage}
            />

            {/* Caption & Controls */}
            <div className={styles.lightboxCaption}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                {selectedAlbum.media[lightboxIndex].title}
              </div>
              {selectedAlbum.media[lightboxIndex].caption && (
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.25rem' }}>
                  {selectedAlbum.media[lightboxIndex].caption}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.5rem' }}>
                Photo {lightboxIndex + 1} of {selectedAlbum.media.length}
                {canManage && (
                  <button
                    onClick={() => handleDeleteMedia(selectedAlbum.media[lightboxIndex].id)}
                    style={{
                      marginLeft: '1rem',
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <Trash2 size={13} /> Delete Photo
                  </button>
                )}
              </div>
            </div>

            {/* Next Photo */}
            {lightboxIndex < selectedAlbum.media.length - 1 && (
              <button
                className={`${styles.lightboxNavBtn} ${styles.lightboxNext}`}
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                title="Next photo"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
