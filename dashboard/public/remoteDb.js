// remoteDb.js — replaces the old server-side database.js. Same function
// names and shapes wherever possible, so the rest of the app's logic
// barely has to change — just who calls what. A plain classic script
// (no import/export), same as every other file in public/ — it declares
// these as top-level consts, which makes them ordinary globals other
// scripts can call directly, exactly like tags.js's or spacesState.js's
// functions do. Needs supabaseClient.js loaded first (for the global
// `sb` client — named sb, not supabase, because the Supabase CDN library
// itself already uses the global name `supabase` for its own namespace;
// reusing that name for our client caused a "already declared" collision)
// and must itself load before any script that calls these functions. RLS
// policies (01-user-id-and-rls.sql) enforce per-user access — not this file.
//
// IMPORTANT LIMITATION: a few operations here (deleteSpace, migrateSpace,
// mergeTags) touch several tables in sequence. The old database.js ran
// those inside one Postgres transaction (all-or-nothing). A browser
// talking to Supabase over its REST API can't start a raw multi-statement
// transaction the same way, so these run as several separate calls in a
// row instead. For a solo-user app this is an acceptable trade-off (worst
// case of a failure mid-sequence: a partial move that's easy to notice and
// redo), but it's worth knowing this is no longer atomic like before.

const TAG_COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E',
    '#F09300', '#F6BF26', '#7CB342', '#0B8043',
    '#009688', '#33B679', '#039BE5', '#3F51B5',
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];

// --- Phrases ---

const saveSentence = async ({ sourceText, variant1, variant2, spaceId, tagId }) => {
    const { data, error } = await sb.from('phrases').insert({
        source_text: sourceText,
        variant_1: variant1,
        variant_2: variant2,
        space_id: spaceId,
        tag_id: tagId || null
    }).select().single();
    if (error) throw error;
    return data;
};

const getPhraseById = async (id) => {
    const { data, error } = await sb.from('phrases').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
};

// Editor-driven save: same as the original — overwrites wording, clears
// the cached-audio flags (see updatePhraseTtsFlag below for why these are
// flags now, not URLs).
const updatePhrase = async ({ id, sourceText, variant1, variant2 }) => {
    const { data, error } = await sb.from('phrases').update({
        source_text: sourceText,
        variant_1: variant1,
        variant_2: variant2,
        tts_url_variant1: null,
        tts_url_variant2: null
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

const updatePhraseTag = async ({ id, tagId }) => {
    const { data, error } = await sb.from('phrases').update({ tag_id: tagId || null }).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

const updatePhraseLevel = async ({ id, level }) => {
    const { data, error } = await sb.from('phrases').update({ level }).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

const updatePhraseLearned = async ({ id, learned }) => {
    const { data, error } = await sb.from('phrases')
        .update({ learned_at: learned ? new Date().toISOString() : null })
        .eq('id', id).select().single();
    if (error) throw error;
    return data;
};

const bulkMovePhrases = async ({ ids, targetSpaceId }) => {
    const { data, error } = await sb.from('phrases')
        .update({ space_id: targetSpaceId, tag_id: null })
        .in('id', ids)
        .select();
    if (error) throw error;
    return data;
};

const deletePhrase = async (id) => {
    const { data, error } = await sb.from('phrases').delete().eq('id', id).select().maybeSingle();
    if (error) throw error;
    return data || null;
};

// TTS, changed from the server version: there, this column held a path to
// a WAV file saved on the server's disk, shared by every device. Here,
// the actual audio file lives in THIS device's IndexedDB (see
// ttsStorage.js) and is never uploaded anywhere — so this column is now
// just a flag ('cached' once this device has generated audio for that
// variant, or null if not yet), not a playable URL. A phrase played from
// a different device will regenerate its own local copy the first time,
// same as if it had never been played before.
const updatePhraseTtsFlag = async ({ id, variant, cached }) => {
    const column = variant === 1 ? 'tts_url_variant1' : 'tts_url_variant2';
    const { data, error } = await sb.from('phrases')
        .update({ [column]: cached ? 'cached' : null })
        .eq('id', id).select().single();
    if (error) throw error;
    return data;
};

// Mirrors the original's LEFT JOIN onto tags, using Supabase's embedded-
// resource select (phrases.tag_id -> tags.id) and flattening the result
// to tag_name/tag_color so calling code doesn't need to change.
const getPhrases = async (spaceId) => {
    const { data, error } = await sb
        .from('phrases')
        .select('*, tags(name, color)')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(({ tags, ...rest }) => ({
        ...rest,
        tag_name: tags?.name ?? null,
        tag_color: tags?.color ?? null
    }));
};

// --- Spaces ---

const getSpaces = async () => {
    const { data, error } = await sb.from('spaces').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data;
};

// user_id is filled in automatically by the column default (auth.uid()) —
// no need to set it explicitly here.
const createSpace = async ({ name, spaceType, sourceLanguage, targetLanguage, bridgeLanguage }) => {
    const { data, error } = await sb.from('spaces').insert({
        name,
        space_type: spaceType || 'progression',
        source_language: sourceLanguage,
        target_language: targetLanguage,
        bridge_language: bridgeLanguage || null
    }).select().single();
    if (error) throw error;
    return data;
};

const updateSpace = async ({ id, name, aboutThisSpace, variant1Notes, variant2Notes, audioRecordingNotes }) => {
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (aboutThisSpace !== undefined) fields.about_this_space = aboutThisSpace || null;
    if (variant1Notes !== undefined) fields.variant_1_notes = variant1Notes || null;
    if (variant2Notes !== undefined) fields.variant_2_notes = variant2Notes || null;
    if (audioRecordingNotes !== undefined) fields.audio_recording_notes = audioRecordingNotes || null;

    if (Object.keys(fields).length === 0) {
        const { data, error } = await sb.from('spaces').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    }

    const { data, error } = await sb.from('spaces').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

// Deletes everything scoped to a space, then the space itself — same
// order as the original (phrases, dictionary, transcripts, tags, space),
// just as separate sequential calls instead of one transaction (see the
// file-level note above). Doesn't touch IndexedDB-cached TTS audio — the
// caller (phrasesTable.js / ttsStorage.js) cleans that up itself, same
// pattern as a single phrase delete.
const deleteSpace = async (id) => {
    const { error: e1 } = await sb.from('phrases').delete().eq('space_id', id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from('dictionary').delete().eq('space_id', id);
    if (e2) throw e2;
    const { error: e3 } = await sb.from('transcripts').delete().eq('space_id', id);
    if (e3) throw e3;
    const { error: e4 } = await sb.from('tags').delete().eq('space_id', id);
    if (e4) throw e4;
    const { data, error: e5 } = await sb.from('spaces').delete().eq('id', id).select().single();
    if (e5) throw e5;
    return data;
};

const MAX_TRANSCRIPTS_PER_SPACE_MIGRATION = 3;

const migrateSpace = async ({ sourceId, targetId, dropSourceTranscripts = false }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot migrate a space into itself');
    }

    if (!dropSourceTranscripts) {
        const [sourceCountRes, targetCountRes] = await Promise.all([
            sb.from('transcripts').select('*', { count: 'exact', head: true }).eq('space_id', sourceId),
            sb.from('transcripts').select('*', { count: 'exact', head: true }).eq('space_id', targetId)
        ]);
        if (sourceCountRes.error) throw sourceCountRes.error;
        if (targetCountRes.error) throw targetCountRes.error;
        const sourceCount = sourceCountRes.count || 0;
        const targetCount = targetCountRes.count || 0;
        if (sourceCount + targetCount > MAX_TRANSCRIPTS_PER_SPACE_MIGRATION) {
            const err = new Error('Too many transcripts to migrate');
            err.code = 'TOO_MANY_TRANSCRIPTS';
            err.sourceCount = sourceCount;
            err.targetCount = targetCount;
            throw err;
        }
    }

    if (dropSourceTranscripts) {
        const { error } = await sb.from('transcripts').delete().eq('space_id', sourceId);
        if (error) throw error;
    } else {
        const { error } = await sb.from('transcripts').update({ space_id: targetId }).eq('space_id', sourceId);
        if (error) throw error;
    }

    const [sourceTagsRes, targetTagsRes] = await Promise.all([
        sb.from('tags').select('*').eq('space_id', sourceId),
        sb.from('tags').select('*').eq('space_id', targetId)
    ]);
    if (sourceTagsRes.error) throw sourceTagsRes.error;
    if (targetTagsRes.error) throw targetTagsRes.error;
    const sourceTags = sourceTagsRes.data || [];
    const targetTags = targetTagsRes.data || [];

    const usedNames = new Set(targetTags.map(t => t.name.toLowerCase()));
    const usedColors = new Set(targetTags.filter(t => t.color).map(t => t.color));

    for (const tag of sourceTags) {
        let newName = tag.name;
        if (usedNames.has(newName.toLowerCase())) {
            let suffix = '';
            let attempt = 1;
            do {
                suffix = attempt === 1 ? ' (new)' : ` (new ${attempt})`;
                attempt++;
            } while (usedNames.has((tag.name + suffix).toLowerCase()));
            newName = tag.name + suffix;
        }
        usedNames.add(newName.toLowerCase());

        let newColor = tag.color;
        if (newColor && usedColors.has(newColor)) {
            newColor = TAG_COLORS.find(c => !usedColors.has(c)) || null;
        }
        if (newColor) usedColors.add(newColor);

        const { error } = await sb.from('tags')
            .update({ space_id: targetId, name: newName, color: newColor })
            .eq('id', tag.id);
        if (error) throw error;
    }

    const { error: movePhrasesError } = await sb.from('phrases')
        .update({ space_id: targetId })
        .eq('space_id', sourceId);
    if (movePhrasesError) throw movePhrasesError;

    const { error: deleteSpaceError } = await sb.from('spaces').delete().eq('id', sourceId);
    if (deleteSpaceError) throw deleteSpaceError;
};

const getSpaceRuleFields = async (spaceId) => {
    const { data, error } = await sb
        .from('spaces')
        .select('about_this_space, variant_1_notes, variant_2_notes, audio_recording_notes, space_type, source_language, target_language, bridge_language')
        .eq('id', spaceId)
        .single();
    if (error) throw error;
    const row = data || {};
    return {
        aboutThisSpace: row.about_this_space ?? null,
        variant1Notes: row.variant_1_notes ?? null,
        variant2Notes: row.variant_2_notes ?? null,
        audioRecordingNotes: row.audio_recording_notes ?? null,
        spaceType: row.space_type ?? 'progression',
        sourceLanguage: row.source_language ?? 'Hebrew',
        targetLanguage: row.target_language ?? 'English',
        bridgeLanguage: row.bridge_language ?? null
    };
};

// --- Tags ---

const getTags = async (spaceId) => {
    const { data, error } = await sb.from('tags').select('*').eq('space_id', spaceId).order('name', { ascending: true });
    if (error) throw error;
    return data;
};

const createTag = async ({ name, color, spaceId }) => {
    const { data, error } = await sb.from('tags')
        .insert({ name, color: color || null, space_id: spaceId })
        .select().single();
    if (error) throw error;
    return data;
};

const updateTag = async ({ id, name, color }) => {
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (color !== undefined) fields.color = color || null;

    if (Object.keys(fields).length === 0) {
        const { data, error } = await sb.from('tags').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    }

    const { data, error } = await sb.from('tags').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

const deleteTag = async (id) => {
    const { count, error: countError } = await sb
        .from('phrases')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', id);
    if (countError) throw countError;
    if ((count || 0) > 0) {
        throw new Error(`This tag has ${count} phrase(s) linked to it. Merge or retag them first.`);
    }
    const { error } = await sb.from('tags').delete().eq('id', id);
    if (error) throw error;
};

// Moves every phrase from sourceId onto targetId, then deletes the
// source tag — same order as the original, run as two sequential calls
// instead of one transaction.
const mergeTags = async ({ sourceId, targetId }) => {
    if (sourceId === targetId) {
        throw new Error('Cannot merge a tag into itself');
    }

    const { data: existing, error: checkError } = await sb
        .from('tags').select('id').in('id', [sourceId, targetId]);
    if (checkError) throw checkError;
    if (!existing || existing.length !== 2) {
        throw new Error('Both tags must exist');
    }

    const { error: updateError } = await sb.from('phrases')
        .update({ tag_id: targetId }).eq('tag_id', sourceId);
    if (updateError) throw updateError;

    const { error: deleteError } = await sb.from('tags').delete().eq('id', sourceId);
    if (deleteError) throw deleteError;
};

// --- Transcripts ---

const getTranscripts = async (spaceId) => {
    const { data, error } = await sb.from('transcripts')
        .select('*').eq('space_id', spaceId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

const createTranscript = async ({ spaceId, content }) => {
    const { data, error } = await sb.from('transcripts')
        .insert({ space_id: spaceId, content }).select().single();
    if (error) throw error;
    return data;
};

const deleteTranscript = async (id) => {
    const { data, error } = await sb.from('transcripts').delete().eq('id', id).select().maybeSingle();
    if (error) throw error;
    return data || null;
};

// --- Dictionary ---

const getDictionaryEntries = async (spaceId) => {
    const { data, error } = await sb.from('dictionary')
        .select('*').eq('space_id', spaceId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

const saveDictionaryEntry = async ({ spaceId, sourceQuery, word, partOfSpeech, sourceSynonyms, exampleSentence, targetSynonyms }) => {
    const { data, error } = await sb.from('dictionary').insert({
        space_id: spaceId,
        source_query: sourceQuery || null,
        word,
        part_of_speech: partOfSpeech,
        source_synonyms: sourceSynonyms,
        example_sentence: exampleSentence,
        target_synonyms: targetSynonyms
    }).select().single();
    if (error) throw error;
    return data;
};

const updateDictionaryEntryLearned = async ({ id, learned }) => {
    const { data, error } = await sb.from('dictionary')
        .update({ learned_at: learned ? new Date().toISOString() : null })
        .eq('id', id).select().single();
    if (error) throw error;
    return data;
};

const deleteDictionaryEntry = async (id) => {
    const { data, error } = await sb.from('dictionary').delete().eq('id', id).select().maybeSingle();
    if (error) throw error;
    return data || null;
};