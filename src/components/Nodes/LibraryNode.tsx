/**
 * Library Node - Two-panel audio library browser with tag management
 *
 * Layout:
 * - Left panel: Tags (pinned at top, others below, resizable separator)
 * - Right panel: Search bar + file list with tag badges
 *
 * Features:
 * - Link local folders containing audio files
 * - Tag management with auto-colors
 * - Drag files onto tags to tag them
 * - Drag files to canvas to create clips
 * - Resizable node
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import type { GraphNode, LibraryNodeData, LibraryItemRef, NodeData } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import {
  useLibraryStore,
  getSampleFile,
  getTagColor,
  getTagColorDark,
  type LibraryItem,
} from '../../store/libraryStore';
import { isFileSystemAccessSupported, selectLibraryFolder } from '../../utils/fileSystemAccess';
import { getAudioContext } from '../../audio/AudioEngine';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import { useResize } from '../../hooks/useResize';
import { usePanelResize } from '../../hooks/usePanelResize';
import { ResizeHandles } from '../common/ResizeHandles';
import { PanelSeparator } from '../common/PanelSeparator';
import { ScrollContainer } from '../common/ScrollContainer';

interface LibraryNodeProps {
  node: GraphNode;
  handleHeaderMouseDown: (e: React.MouseEvent) => void;
  handleNodeMouseEnter: () => void;
  handleNodeMouseLeave: () => void;
  isSelected: boolean;
  isDragging: boolean;
  style: React.CSSProperties;
}

// Minimum dimensions for resizing - must match CSS .library-node min-width/min-height
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

// Type guard for LibraryNodeData
function isLibraryNodeData(data: NodeData | undefined): data is LibraryNodeData {
  return data !== null && data !== undefined && typeof data === 'object';
}

export function LibraryNode({
  node,
  handleHeaderMouseDown,
  handleNodeMouseEnter,
  handleNodeMouseLeave,
  isSelected,
  isDragging,
  style,
}: LibraryNodeProps) {
  // Validate node data with type guard and provide defaults
  const data: LibraryNodeData = isLibraryNodeData(node.data) ? node.data : {
    libraryId: undefined,
    currentItemId: undefined,
    itemRefs: [],
    playbackMode: 'oneshot',
    volume: 0.8,
  };
  const updateNodeData = useGraphStore(s => s.updateNodeData);

  // Library store
  const libraries = useLibraryStore(s => s.libraries);
  const items = useLibraryStore(s => s.items);
  const scanProgress = useLibraryStore(s => s.scanProgress);
  const addLibrary = useLibraryStore(s => s.addLibrary);
  const scanLibrary = useLibraryStore(s => s.scanLibrary);
  const getItemsByLibrary = useLibraryStore(s => s.getItemsByLibrary);
  const projectLibraryId = useLibraryStore(s => s.projectLibraryId);

  // Tag management from store
  const pinnedTags = useLibraryStore(s => s.pinnedTags);
  const allTags = useLibraryStore(s => s.allTags);
  const createTag = useLibraryStore(s => s.createTag);
  const pinTag = useLibraryStore(s => s.pinTag);
  const unpinTag = useLibraryStore(s => s.unpinTag);
  const addTagToItem = useLibraryStore(s => s.addTagToItem);
  const activeFilterTag = useLibraryStore(s => s.activeFilterTag);
  const setActiveFilterTag = useLibraryStore(s => s.setActiveFilterTag);
  const trashItem = useLibraryStore(s => s.trashItem);
  const restoreItem = useLibraryStore(s => s.restoreItem);

  // Auto-connect to project library if available
  // Priority: node's own libraryId > projectLibraryId
  const effectiveLibraryId = data.libraryId || projectLibraryId;

  // Auto-set the library ID when project library becomes available
  useEffect(() => {
    // If node doesn't have a library set and project library is available, auto-select it
    if (!data.libraryId && projectLibraryId && libraries[projectLibraryId]) {
      updateNodeData<LibraryNodeData>(node.id, { libraryId: projectLibraryId });
    }
  }, [data.libraryId, projectLibraryId, libraries, node.id, updateNodeData]);

  // Also trigger scan if library exists but hasn't been scanned
  useEffect(() => {
    if (effectiveLibraryId && libraries[effectiveLibraryId]) {
      const lib = libraries[effectiveLibraryId];
      // If library has never been scanned (lastScanAt = 0), trigger a scan
      if (lib.lastScanAt === 0 && lib.status !== 'scanning') {
        scanLibrary(effectiveLibraryId, false).catch(console.error);
      }
    }
  }, [effectiveLibraryId, libraries, scanLibrary]);

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [previewingItemId, setPreviewingItemId] = useState<string | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [dragOverTag, setDragOverTag] = useState<string | null>(null);
  const [dragOverPinnedSection, setDragOverPinnedSection] = useState(false);
  const [draggingTag, setDraggingTag] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Multi-selection state
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Refs
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const editNameInputRef = useRef<HTMLInputElement>(null);
  const filesContainerRef = useRef<HTMLDivElement>(null);
  const fileRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get updateItem from store
  const updateItem = useLibraryStore(s => s.updateItem);

  // Node resize hook
  const {
    width: nodeWidth,
    height: nodeHeight,
    handleResizeStart,
    nodeRef,
    isResizing,
  } = useResize({
    nodeId: node.id,
    initialWidth: data.width ?? 500,
    initialHeight: data.height ?? 400,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    onDimensionsChange: (w, h) => updateNodeData<LibraryNodeData>(node.id, { width: w, height: h }),
  });

  // Panel separator hook
  const {
    position: separatorPos,
    isDragging: isDraggingSeparator,
    handleSeparatorMouseDown,
    containerRef: leftPanelRef,
  } = usePanelResize({
    nodeId: node.id,
    initialPosition: data.separatorPosition ?? 0.5,
    mode: 'percentage',
    min: 0.2,
    max: 0.8,
    direction: 'vertical',
    onPositionChange: (pos) => updateNodeData<LibraryNodeData>(node.id, { separatorPosition: pos }),
  });

  // Get current library
  const currentLibrary = effectiveLibraryId ? libraries[effectiveLibraryId] : null;

  // Debounce search input for performance (I1)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear selection and tag filter when library changes (C3, I6)
  useEffect(() => {
    setSelectedItemIds(new Set());
    setActiveFilterTag(null);
  }, [effectiveLibraryId, setActiveFilterTag]);

  // Get other (non-pinned) tags
  const otherTags = useMemo(() => {
    return allTags.filter(t => !pinnedTags.includes(t));
  }, [allTags, pinnedTags]);

  // Get filtered items - uses debounced search for performance (I2)
  const libraryItems = useMemo(() => {
    if (!effectiveLibraryId) return [];
    let allItems = getItemsByLibrary(effectiveLibraryId);

    // Hide trashed items unless 'trash' is the active filter
    if (activeFilterTag !== 'trash') {
      allItems = allItems.filter((item: LibraryItem) => !item.tags.includes('trash'));
    }

    // Filter by active tag
    if (activeFilterTag) {
      allItems = allItems.filter((item: LibraryItem) => item.tags.includes(activeFilterTag));
    }

    // Filter by search (using debounced value)
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase();
      allItems = allItems.filter(
        (s: LibraryItem) =>
          s.fileName.toLowerCase().includes(query) ||
          s.tags.some((t: string) => t.toLowerCase().includes(query))
      );
    }

    return allItems;
  }, [effectiveLibraryId, getItemsByLibrary, debouncedSearch, activeFilterTag]);

  // Handle linking a new folder
  const handleLinkFolder = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      toast.error('File System Access API not supported. Please use Chrome or Edge.');
      return;
    }

    setIsLinking(true);
    try {
      const handle = await selectLibraryFolder();
      const libraryId = await addLibrary(handle);
      updateNodeData<LibraryNodeData>(node.id, { libraryId });
      await scanLibrary(libraryId, true);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to link folder:', err);
      }
    } finally {
      setIsLinking(false);
    }
  }, [node.id, addLibrary, scanLibrary, updateNodeData]);

  // Handle item selection (I5: with loading state, C5: with toast errors)
  const handleSelectItem = useCallback(
    async (itemId: string) => {
      const item = items[itemId];
      if (!item) return;

      setLoadingItemId(itemId);

      updateNodeData<LibraryNodeData>(node.id, {
        currentItemId: itemId,
        itemRefs: [
          ...(data.itemRefs || []).filter((r: LibraryItemRef) => r.id !== itemId),
          {
            id: itemId,
            relativePath: item.relativePath,
            displayName: item.fileName,
            libraryId: item.libraryId,
          },
        ],
      });

      // Load and send buffer to connected samplers
      try {
        const file = await getSampleFile(itemId);
        if (!file) {
          toast.error('File not found - it may have been moved or deleted');
          return;
        }
        const ctx = getAudioContext();
        if (!ctx) {
          toast.error('Audio system not available');
          return;
        }
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        audioGraphManager.sendSampleBuffer(node.id, audioBuffer);
      } catch (err) {
        console.error('Failed to load item for sampler:', err);
        toast.error('Failed to load audio file');
      } finally {
        setLoadingItemId(null);
      }
    },
    [node.id, items, data.itemRefs, updateNodeData]
  );

  // Handle preview (C1: track active sources, C5: toast errors, I7: proper error logging)
  const handlePreviewItem = useCallback(
    async (itemId: string) => {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('Stop failed:', e);
        }
        audioSourceRef.current = null;
      }

      if (previewingItemId === itemId) {
        setPreviewingItemId(null);
        return;
      }

      setPreviewingItemId(itemId);

      // Capture the expected item ID for the onended callback closure
      const expectedItemId = itemId;

      try {
        const file = await getSampleFile(itemId);
        if (!file) {
          setPreviewingItemId(null);
          toast.error('File not found');
          return;
        }

        const ctx = getAudioContext();
        if (!ctx) {
          setPreviewingItemId(null);
          toast.error('Audio system not available');
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        // Track this source for cleanup (C1)
        activeSourcesRef.current.add(source);

        source.onended = () => {
          // Only clear preview state if this source's item is still the current preview
          // This prevents race conditions where a new preview starts before this one ends
          setPreviewingItemId((current) => current === expectedItemId ? null : current);
          if (audioSourceRef.current === source) {
            audioSourceRef.current = null;
          }
          // Remove from active sources set
          activeSourcesRef.current.delete(source);
        };
        source.start();
        audioSourceRef.current = source;
      } catch (err) {
        console.error('Preview failed:', err);
        setPreviewingItemId(null);
        toast.error('Preview failed - file may be corrupted');
      }
    },
    [previewingItemId]
  );

  // Cleanup on unmount (C1: stop all audio sources, C2: clear refs)
  useEffect(() => {
    return () => {
      // Stop all active audio sources (C1)
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('Stop failed:', e);
        }
      });
      activeSourcesRef.current.clear();

      // Stop current preview source
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('Stop failed:', e);
        }
      }

      // Clear file row refs (C2)
      fileRowRefs.current.clear();
    };
  }, []);

  // Handle double-click to edit file name
  const handleStartEditFileName = useCallback((itemId: string) => {
    const item = items[itemId];
    if (!item) return;
    // Get base name without extension
    const baseName = item.fileName.replace(/\.[^.]+$/, '');
    setEditingItemId(itemId);
    setEditingName(baseName);
  }, [items]);

  // Handle save file name
  const handleSaveFileName = useCallback(() => {
    if (!editingItemId || !editingName.trim()) {
      setEditingItemId(null);
      setEditingName('');
      return;
    }

    const item = items[editingItemId];
    if (!item) {
      setEditingItemId(null);
      setEditingName('');
      return;
    }

    // Get original extension
    const extMatch = item.fileName.match(/\.[^.]+$/);
    const extension = extMatch ? extMatch[0] : '';
    const newFileName = editingName.trim() + extension;

    // Only update if name changed
    if (newFileName !== item.fileName) {
      updateItem(editingItemId, { fileName: newFileName });
    }

    setEditingItemId(null);
    setEditingName('');
  }, [editingItemId, editingName, items, updateItem]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingItemId && editNameInputRef.current) {
      editNameInputRef.current.focus();
      editNameInputRef.current.select();
    }
  }, [editingItemId]);

  // Handle drag start for file - only set drag data, don't create clip yet
  // Clip will be created when dropped on canvas (handled by NodeCanvas)
  const handleFileDragStart = useCallback(
    (e: React.DragEvent, item: LibraryItem) => {
      e.stopPropagation();

      // If this item is selected, drag all selected items; otherwise just this one
      const itemsToDrag = selectedItemIds.has(item.id) && selectedItemIds.size > 1
        ? Array.from(selectedItemIds)
        : [item.id];

      // Set drag data - item IDs for tagging (comma-separated), single item data for canvas drop
      e.dataTransfer.setData('application/library-item-ids', itemsToDrag.join(','));
      e.dataTransfer.setData('application/library-item-id', item.id); // For backwards compatibility
      e.dataTransfer.setData('application/library-item', JSON.stringify({
        id: item.id,
        fileName: item.fileName,
        duration: item.duration,
        sampleRate: item.sampleRate,
        sourceNodeId: node.id,
      }));
      e.dataTransfer.effectAllowed = 'copyMove';

      // Set a drag image
      const dragEl = e.currentTarget as HTMLElement;
      if (dragEl) {
        e.dataTransfer.setDragImage(dragEl, 60, 20);
      }
    },
    [node.id, selectedItemIds]
  );

  // Handle drop on tag (tag all dragged files)
  const handleTagDrop = useCallback(
    (e: React.DragEvent, tagName: string) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent canvas from also handling the drop
      setDragOverTag(null);

      // Try to get multiple item IDs first
      const itemIdsStr = e.dataTransfer.getData('application/library-item-ids');
      if (itemIdsStr) {
        const itemIds = itemIdsStr.split(',').filter(Boolean);
        itemIds.forEach(id => addTagToItem(id, tagName));
      } else {
        // Fallback to single item
        const itemId = e.dataTransfer.getData('application/library-item-id');
        if (itemId) {
          addTagToItem(itemId, tagName);
        }
      }
    },
    [addTagToItem]
  );

  // Selection box handlers for files panel
  // Use refs to track selection state for window event listeners
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });

  // Window-level handlers for robust selection (using refs to avoid stale closures)
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isSelectingRef.current) return;

      const container = filesContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      // Get scroll offset from scroll container ref (I4: replaced querySelector with ref)
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;

      const x = e.clientX - rect.left + scrollLeft;
      const y = e.clientY - rect.top + scrollTop;

      setSelectionBox({
        startX: selectionStartRef.current.x,
        startY: selectionStartRef.current.y,
        currentX: x,
        currentY: y,
      });
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (!isSelectingRef.current) return;

      isSelectingRef.current = false;
      const container = filesContainerRef.current;
      if (!container) {
        setSelectionBox(null);
        return;
      }

      // Get current selection box state for calculating selection
      const rect = container.getBoundingClientRect();
      // Use ref instead of querySelector (I4)
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;

      const currentX = e.clientX - rect.left + scrollLeft;
      const currentY = e.clientY - rect.top + scrollTop;
      const startX = selectionStartRef.current.x;
      const startY = selectionStartRef.current.y;

      // Calculate selection rectangle
      const minX = Math.min(startX, currentX);
      const maxX = Math.max(startX, currentX);
      const minY = Math.min(startY, currentY);
      const maxY = Math.max(startY, currentY);

      // Only select if dragged more than 5 pixels
      if (maxX - minX < 5 && maxY - minY < 5) {
        setSelectionBox(null);
        return;
      }

      const newSelected = new Set<string>();

      // Check each file row's play button against selection box
      fileRowRefs.current.forEach((rowEl, itemId) => {
        const playBtn = rowEl.querySelector('.file-preview-btn');
        if (!playBtn) return;

        const btnRect = playBtn.getBoundingClientRect();
        // Convert to container-relative coordinates
        const btnLeft = btnRect.left - rect.left + scrollLeft;
        const btnRight = btnRect.right - rect.left + scrollLeft;
        const btnTop = btnRect.top - rect.top + scrollTop;
        const btnBottom = btnRect.bottom - rect.top + scrollTop;

        // Check if entire play button is within selection box
        if (btnLeft >= minX && btnRight <= maxX && btnTop >= minY && btnBottom <= maxY) {
          newSelected.add(itemId);
        }
      });

      setSelectedItemIds(newSelected);
      setSelectionBox(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleFilesMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection if clicking on empty space (not on a file row)
    const target = e.target as HTMLElement;
    if (target.closest('.library-file-row')) return;
    // Also ignore if clicking on scroll container padding or other interactive elements
    if (target.closest('button') || target.closest('input')) return;

    // Stop propagation to prevent canvas from starting its selection box
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection during drag

    const container = filesContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Get scroll offset from scroll container ref (I4)
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;

    const x = e.clientX - rect.left + scrollLeft;
    const y = e.clientY - rect.top + scrollTop;

    // Store start position in ref for window event listeners
    selectionStartRef.current = { x, y };
    isSelectingRef.current = true;

    setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
    setSelectedItemIds(new Set()); // Clear selection when starting new box
  }, []);

  // Clear selection when clicking elsewhere
  const handleFileRowClick = useCallback((itemId: string, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Multi-select with modifier key
      setSelectedItemIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(itemId)) {
          newSet.delete(itemId);
        } else {
          newSet.add(itemId);
        }
        return newSet;
      });
    } else {
      // Single select
      setSelectedItemIds(new Set([itemId]));
    }
    handleSelectItem(itemId);
  }, [handleSelectItem]);

  // Handle tag click (filter)
  const handleTagClick = useCallback((tagName: string) => {
    if (activeFilterTag === tagName) {
      setActiveFilterTag(null);
    } else {
      setActiveFilterTag(tagName);
    }
  }, [activeFilterTag, setActiveFilterTag]);

  // Handle creating new tag
  const handleCreateTag = useCallback(() => {
    const name = newTagName.trim();
    if (name) {
      createTag(name);
      // New tags go to "other tags" first - user can drag to pin
    }
    setNewTagName('');
    setIsCreatingTag(false);
  }, [newTagName, createTag]);

  // Handle tag drag start (from other tags section)
  const handleTagDragStart = useCallback((e: React.DragEvent, tagName: string) => {
    e.dataTransfer.setData('application/tag-name', tagName);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTag(tagName);
  }, []);

  // Handle tag drag end
  const handleTagDragEnd = useCallback(() => {
    setDraggingTag(null);
    setDragOverPinnedSection(false);
  }, []);

  // Handle drop on pinned tags section (to pin a tag)
  const handlePinnedSectionDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent canvas from also handling the drop
    setDragOverPinnedSection(false);

    const tagName = e.dataTransfer.getData('application/tag-name');
    if (tagName && !pinnedTags.includes(tagName)) {
      pinTag(tagName);
    }
  }, [pinnedTags, pinTag]);

  // Focus input when creating tag
  useEffect(() => {
    if (isCreatingTag && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [isCreatingTag]);


  // Render tag item
  const renderTag = (tagName: string, isPinned: boolean) => {
    const isActive = activeFilterTag === tagName;
    const color = getTagColor(tagName);
    const isDragging = draggingTag === tagName;

    return (
      <div
        key={tagName}
        className={`library-tag ${isActive ? 'active' : ''} ${dragOverTag === tagName ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{ '--tag-color': color } as React.CSSProperties}
        onClick={() => handleTagClick(tagName)}
        draggable={!isPinned}
        onDragStart={(e) => !isPinned && handleTagDragStart(e, tagName)}
        onDragEnd={handleTagDragEnd}
        onDragOver={(e) => { e.preventDefault(); setDragOverTag(tagName); }}
        onDragLeave={() => setDragOverTag(null)}
        onDrop={(e) => handleTagDrop(e, tagName)}
        title={isPinned ? 'Click to filter, drop file to tag' : 'Drag up to pin, click to filter'}
      >
        <span className="tag-indicator" style={{ backgroundColor: color }} />
        <span className="tag-name">{tagName}</span>
        {isPinned && (
          <button
            className="tag-unpin-btn"
            onClick={(e) => { e.stopPropagation(); unpinTag(tagName); }}
            title="Unpin tag"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  // Render file row (I5: includes loading state)
  const renderFileRow = (item: LibraryItem) => {
    const isActive = data.currentItemId === item.id;
    const isPreviewing = previewingItemId === item.id;
    const isLoading = loadingItemId === item.id;
    const isMissing = item.status === 'missing';
    const isTrashed = item.tags.includes('trash');
    const isEditing = editingItemId === item.id;
    const isMultiSelected = selectedItemIds.has(item.id);

    return (
      <div
        key={item.id}
        ref={(el) => {
          if (el) fileRowRefs.current.set(item.id, el);
          else fileRowRefs.current.delete(item.id);
        }}
        className={`library-file-row ${isActive ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isMissing ? 'missing' : ''} ${isTrashed ? 'trashed' : ''} ${isEditing ? 'editing' : ''} ${isLoading ? 'loading' : ''}`}
        onClick={(e) => !isEditing && handleFileRowClick(item.id, e)}
        draggable={!isTrashed && !isEditing}
        onDragStart={(e) => !isTrashed && !isEditing && handleFileDragStart(e, item)}
      >
        {/* Play/Stop button or loading indicator (I5) */}
        <button
          className={`file-preview-btn ${isPreviewing ? 'playing' : ''} ${isLoading ? 'loading' : ''}`}
          onClick={e => { e.stopPropagation(); handlePreviewItem(item.id); }}
          title={isLoading ? 'Loading...' : (isPreviewing ? 'Stop' : 'Preview')}
          disabled={isLoading}
        >
          {isLoading ? '...' : (isPreviewing ? '■' : '▶')}
        </button>

        {/* File name - editable on double-click */}
        {isEditing ? (
          <input
            ref={editNameInputRef}
            type="text"
            className="file-name-input"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleSaveFileName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveFileName();
              } else if (e.key === 'Escape') {
                setEditingItemId(null);
                setEditingName('');
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="file-name"
            title={`${item.relativePath} (double-click to rename)`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleStartEditFileName(item.id);
            }}
          >
            {item.fileName}
          </span>
        )}

        {/* Tag badges (right-aligned) */}
        <div className="file-tags">
          {item.tags.filter(t => t !== 'trash').slice(0, 2).map(tag => (
            <span
              key={tag}
              className="file-tag-badge"
              style={{
                '--tag-bg': getTagColor(tag),
                '--tag-text': getTagColorDark(tag),
              } as React.CSSProperties}
              onClick={(e) => { e.stopPropagation(); handleTagClick(tag); }}
              title={`Filter by ${tag}`}
            >
              {tag}
            </span>
          ))}
          {item.tags.filter(t => t !== 'trash').length > 2 && (
            <span className="file-tag-more">+{item.tags.filter(t => t !== 'trash').length - 2}</span>
          )}
        </div>

        {/* Trash/Restore button */}
        <button
          className={`file-trash-btn ${isTrashed ? 'restore' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isTrashed) {
              restoreItem(item.id);
            } else {
              trashItem(item.id);
            }
          }}
          title={isTrashed ? 'Restore' : 'Move to trash'}
        >
          {isTrashed ? '↩' : '×'}
        </button>
      </div>
    );
  };

  // Check if scanning
  const isScanning =
    scanProgress !== null && scanProgress.libraryId === effectiveLibraryId && scanProgress.phase !== 'complete';

  // Combined style with dimensions
  const nodeStyle: React.CSSProperties = {
    ...style,
    width: nodeWidth,
    height: nodeHeight,
  };

  return (
    <div
      ref={nodeRef}
      className={`schematic-node library-node library-two-panel ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={nodeStyle}
      onMouseEnter={handleNodeMouseEnter}
      onMouseLeave={handleNodeMouseLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="schematic-header" onMouseDown={handleHeaderMouseDown}>
        <span className="schematic-title">
          {currentLibrary ? currentLibrary.name : 'Library'}
        </span>
        {currentLibrary && (
          <span className="library-count">{currentLibrary.itemCount}</span>
        )}
      </div>

      {/* Content - Two panel layout */}
      <div className="library-panels">
        {!currentLibrary ? (
          // No library linked - show link button
          <div className="library-empty">
            <button className="library-link-btn" onClick={handleLinkFolder} disabled={isLinking}>
              {isLinking ? 'Linking...' : '+ Link Folder'}
            </button>
            <p className="library-hint">Select a folder containing audio files</p>
          </div>
        ) : isScanning ? (
          // Scanning progress
          <div className="library-scanning">
            <div className="scan-progress">
              <div
                className="scan-progress-bar"
                style={{ width: `${scanProgress && scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}
              />
            </div>
            <span className="scan-status">
              Scanning: {scanProgress?.current || 0} / {scanProgress?.total || '?'}
            </span>
          </div>
        ) : (
          <>
            {/* Left Panel: Tags */}
            <div className="library-left-panel" ref={leftPanelRef}>
              {/* Pinned Tags Section - drop zone for pinning */}
              <div
                className={`library-tags-section pinned ${dragOverPinnedSection ? 'drag-over' : ''}`}
                style={{ height: `${separatorPos * 100}%` }}
                onDragOver={(e) => {
                  if (draggingTag) {
                    e.preventDefault();
                    setDragOverPinnedSection(true);
                  }
                }}
                onDragLeave={() => setDragOverPinnedSection(false)}
                onDrop={handlePinnedSectionDrop}
              >
                <div className="tags-section-header">
                  <span>pinned Tags</span>
                </div>
                <ScrollContainer mode="dropdown" className="tags-list">
                  {pinnedTags.map(tag => renderTag(tag, true))}
                  {pinnedTags.length === 0 && (
                    <div className="no-tags-hint">Drag tags here to pin</div>
                  )}
                </ScrollContainer>
              </div>

              {/* Separator */}
              <PanelSeparator
                direction="vertical"
                onMouseDown={handleSeparatorMouseDown}
                isDragging={isDraggingSeparator}
                className="library-separator"
              />

              {/* Other Tags Section */}
              <div className="library-tags-section other" style={{ height: `${(1 - separatorPos) * 100}%` }}>
                <div className="tags-section-header">
                  <span>other Tags</span>
                  <button
                    className="add-tag-btn"
                    onClick={() => setIsCreatingTag(true)}
                    title="Create new tag"
                  >
                    +
                  </button>
                </div>
                <ScrollContainer mode="dropdown" className="tags-list">
                  {isCreatingTag && (
                    <div className="tag-input-row">
                      <input
                        ref={newTagInputRef}
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateTag();
                          if (e.key === 'Escape') { setIsCreatingTag(false); setNewTagName(''); }
                        }}
                        onBlur={handleCreateTag}
                        placeholder="Tag name..."
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  {otherTags.map(tag => renderTag(tag, false))}
                  {otherTags.length === 0 && !isCreatingTag && (
                    <div className="no-tags-hint">Click + to create tags</div>
                  )}
                </ScrollContainer>
              </div>
            </div>

            {/* Right Panel: Files */}
            <div className="library-right-panel">
              {/* Search bar */}
              <div className="library-search">
                <input
                  type="text"
                  placeholder="Search files and tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                />
                {activeFilterTag && (
                  <button
                    className="clear-filter-btn"
                    onClick={() => setActiveFilterTag(null)}
                    title="Clear tag filter"
                  >
                    × {activeFilterTag}
                  </button>
                )}
              </div>

              {/* File list with selection box support */}
              <div
                ref={filesContainerRef}
                className="library-files-container"
                onMouseDownCapture={handleFilesMouseDown}
              >
                <ScrollContainer ref={scrollContainerRef} mode="dropdown" className="library-files">
                  {libraryItems.length === 0 ? (
                    <div className="library-no-files">
                      {(searchQuery || activeFilterTag) ? `No matching files` : 'No files found'}
                    </div>
                  ) : (
                    <>
                      {/* Search results count (M5) */}
                      {(debouncedSearch || activeFilterTag) && (
                        <div className="library-results-count">{libraryItems.length} item{libraryItems.length !== 1 ? 's' : ''}</div>
                      )}
                      {libraryItems.map(renderFileRow)}
                    </>
                  )}
                </ScrollContainer>

                {/* Selection box overlay */}
                {selectionBox && (
                  <div
                    className="library-selection-box"
                    style={{
                      left: Math.min(selectionBox.startX, selectionBox.currentX),
                      top: Math.min(selectionBox.startY, selectionBox.currentY),
                      width: Math.abs(selectionBox.currentX - selectionBox.startX),
                      height: Math.abs(selectionBox.currentY - selectionBox.startY),
                    }}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Resize handles */}
      <ResizeHandles
        handles={['se', 'e', 's']}
        onResizeStart={handleResizeStart}
        isResizing={isResizing}
      />
    </div>
  );
}
