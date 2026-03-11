/**
 * TrackAdapter.js
 *
 * 统一音乐数据适配层
 *
 * 负责将来自不同数据源的 Track 对象规范化为统一格式（UnifiedTrack）。
 *
 * 目前存在的数据来源格式：
 *   A. bilibili / soundcloud 搜索结果  → 字段名可能是 id/bvid，没有本地路径
 *   B. 本地库 TrackInfo (music.json)   → 拥有 music_id / cover_path / audio_path
 *   C. 下载队列临时对象                → 格式A扩展，缺少本地路径
 *
 * ⚠️ 重要：normalize() 输出的对象会被直接发送给后端下载器，
 * 因此必须保留后端需要的平台特有字段（如 bilibili 的 bvid / aid），
 * 不能将其重命名或加下划线前缀。
 */

class TrackAdapter {
    /**
     * 将任意来源的原始 track 对象标准化为 UnifiedTrack。
     * 可安全地对已规范化的对象重复调用（幂等）。
     *
     * @param {object} raw - 任意来源的原始 track 对象
     * @returns {object} UnifiedTrack 规范对象
     */
    static normalize(raw) {
        if (!raw || typeof raw !== 'object') {
            console.warn('[TrackAdapter] normalize() received invalid input:', raw);
            return TrackAdapter._empty();
        }

        // music_id：统一标识符
        // 来源 A/C 可能用 id 或 bvid，来源 B 用 music_id
        const music_id = String(
            raw.music_id ||
            raw.id ||
            raw.bvid ||
            `unknown-${Date.now()}`
        );

        // artist：统一使用 artist（兼容旧 author 字段）
        const artist =
            (typeof raw.artist === 'string' && raw.artist) ||
            (typeof raw.author === 'string' && raw.author) ||
            '';

        // cover_path：本地封面路径
        // 来源 B 有此字段；来源 A/C 没有
        // 路径兼容：可能以 './' 或 '/' 开头，也可能以 'downloads/' 开头
        let cover_path = raw.cover_path || null;
        if (cover_path && !cover_path.startsWith('./') && !cover_path.startsWith('/')) {
            cover_path = './' + cover_path;
        }

        // audio_path：本地音频路径
        let audio_path = raw.audio_path || null;
        if (audio_path && !audio_path.startsWith('./') && !audio_path.startsWith('/')) {
            audio_path = './' + audio_path;
        }

        return {
            // 核心标识
            music_id,

            // 元数据
            title: raw.title || '',
            artist,
            album: raw.album || '',
            description: raw.description || '',
            genre: raw.genre || '',
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            duration: Number(raw.duration) || 0,
            lossless: Boolean(raw.lossless),
            lyrics: raw.lyrics || '',
            source: raw.source || '',

            // 封面（本地 > 在线）
            cover_path,
            artwork_url: raw.artwork_url || raw.preview_cover || '',

            // 音频（本地路径）
            audio_path,

            // 响度
            loudness_lufs: raw.loudness_lufs ?? null,
            loudness_peak: raw.loudness_peak ?? null,

            // ⚠️ 保留平台特有 ID 字段（后端下载器直接从 track_data 读取）
            // bilibili 下载器读取 track_info.get('bvid') 和 track_info.get('aid')
            // 不能重命名为 _bvid，否则后端找不到
            bvid: raw.bvid || raw._bvid || null,
            aid: raw.aid || null,
        };
    }

    /**
     * 获取封面显示 URL，优先本地路径，回退在线 URL，最终回退占位图。
     *
     * @param {object} track - 任意格式的 track 对象（或已规范化的 UnifiedTrack）
     * @param {string} [placeholder='placeholder_album_art.png']
     * @returns {string} 可用于 <img src> 的 URL
     */
    static getCoverUrl(track, placeholder = 'placeholder_album_art.png') {
        if (!track) return placeholder;

        // 本地封面（优先）
        if (track.cover_path && track.cover_path.trim()) {
            const path = track.cover_path.trim();
            return path.startsWith('./') || path.startsWith('/') ? path : './' + path;
        }

        // 在线封面（备用）
        const onlineUrl = track.artwork_url || track.preview_cover || '';
        if (onlineUrl && onlineUrl.trim()) {
            return onlineUrl.trim();
        }

        return placeholder;
    }

    /**
     * 获取音频本地路径。
     * 返回 null 表示该 track 尚未下载（例如搜索结果）。
     *
     * @param {object} track
     * @returns {string|null}
     */
    static getAudioPath(track) {
        if (!track || !track.audio_path || !track.audio_path.trim()) return null;
        const path = track.audio_path.trim();
        return path.startsWith('./') || path.startsWith('/') ? path : './' + path;
    }

    /**
     * 获取显示用 artist 字符串（兼容 author 字段）。
     *
     * @param {object} track
     * @returns {string}
     */
    static getArtist(track) {
        if (!track) return '';
        return track.artist || track.author || '';
    }

    /**
     * 获取统一的 music_id。
     *
     * @param {object} track
     * @returns {string}
     */
    static getMusicId(track) {
        if (!track) return '';
        return String(track.music_id || track.id || track.bvid || '');
    }

    /**
     * 判断该 track 是否已下载到本地（即是否拥有有效的音频路径）。
     *
     * @param {object} track
     * @returns {boolean}
     */
    static isDownloaded(track) {
        return Boolean(track && track.audio_path && track.audio_path.trim());
    }

    /**
     * 将 track 序列化为安全的 JSON 字符串，用于 data-track-info 属性。
     *
     * @param {object} track
     * @returns {string}
     */
    static toDataAttr(track) {
        return JSON.stringify(TrackAdapter.normalize(track)).replace(/'/g, '&apos;');
    }

    /** 内部：返回一个空的 UnifiedTrack */
    static _empty() {
        return {
            music_id: '', title: '', artist: '', album: '', description: '',
            genre: '', tags: [], duration: 0, lossless: false, lyrics: '',
            source: '', cover_path: null, artwork_url: '', audio_path: null,
            loudness_lufs: null, loudness_peak: null,
            bvid: null, aid: null,
        };
    }
}

export default TrackAdapter;
