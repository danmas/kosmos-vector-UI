import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  OntologyBuildApplyResponse,
  OntologyBuildDepth,
  OntologyBuildMaterializeResponse,
  OntologyConceptCandidate,
  OntologyGroundingCandidate,
} from '../types';
import { apiClient } from '../services/apiClient';

interface OntologyBuilderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialSeedConcepts?: string[];
}

/** Stable empty array — default `= []` creates new ref every render and loops useEffect */
const EMPTY_SEEDS: string[] = [];

type BusyOp = null | 'suggest' | 'materialize' | 'apply';

interface ResultBanner {
  kind: 'success' | 'warning' | 'error' | 'info';
  title: string;
  lines: string[];
}

const DEPTH_OPTIONS: OntologyBuildDepth[] = ['concepts+grounding', 'concepts'];

/** Persist suggest draft per context so reopen doesn't force re-LLM */
const DRAFT_STORAGE_PREFIX = 'ontology-builder-draft:v1:';

function getUiContextCode(): string {
  if (typeof window === 'undefined') return 'CARL';
  return (window as any).g_context_code || 'CARL';
}

interface BuilderDraft {
  contextCode: string;
  savedAt: string;
  maxConcepts: number;
  depth: OntologyBuildDepth;
  aspects: string;
  seedConcepts: string;
  source: string | null;
  concepts: OntologyConceptCandidate[];
}

function draftStorageKey(contextCode: string) {
  return `${DRAFT_STORAGE_PREFIX}${contextCode}`;
}

function loadDraft(contextCode: string): BuilderDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(contextCode));
    if (!raw) return null;
    const data = JSON.parse(raw) as BuilderDraft;
    if (!data || data.contextCode !== contextCode || !Array.isArray(data.concepts)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveDraft(draft: BuilderDraft) {
  try {
    localStorage.setItem(draftStorageKey(draft.contextCode), JSON.stringify(draft));
  } catch (e) {
    console.warn('[OntologyBuilder] cannot save draft', e);
  }
}

function clearDraft(contextCode: string) {
  try {
    localStorage.removeItem(draftStorageKey(contextCode));
  } catch {
    /* ignore */
  }
}

const BUSY_COPY: Record<Exclude<BusyOp, null>, { title: string; hint: string }> = {
  suggest: {
    title: 'Формируем черновик понятий…',
    hint: 'Анализ векторизованной реальности и (при доступности) LLM. Обычно 10–60 сек.',
  },
  materialize: {
    title: 'Записываем MD-файлы понятий…',
    hint: 'Пишем concepts/*.md в onto_loading.dirs (status: draft).',
  },
  apply: {
    title: 'Применяем онтологию…',
    hint: 'materialize → загрузка (onto_loading) → векторизация concept:* → validate. Может занять минуты.',
  },
};

function errMessage(e: any): string {
  if (!e) return 'Неизвестная ошибка';
  if (typeof e.message === 'string' && e.message && e.message !== '[object Object]') {
    return e.message;
  }
  const d = e.data;
  if (d?.error?.message) return String(d.error.message);
  if (typeof d?.error === 'string') return d.error;
  if (typeof d?.message === 'string') return d.message;
  try {
    return JSON.stringify(d?.error || d || e.message || e);
  } catch {
    return String(e);
  }
}

function isOntoConfigError(e: any): boolean {
  return e?.code === 'ONTO_LOADING_NOT_CONFIGURED' || e?.data?.code === 'ONTO_LOADING_NOT_CONFIGURED';
}

function configErrorLines(e: any): string[] {
  const msg = errMessage(e);
  const lines = msg.split('\n').map((s) => s.trim()).filter(Boolean);
  const hintDir = e?.data?.hint?.example?.onto_loading?.dirs?.[0];
  if (hintDir && !lines.some((l) => l.includes(hintDir))) {
    lines.push(`Пример dirs: ${hintDir}`);
  }
  return lines.length ? lines : [msg];
}

const OntologyBuilderDialog: React.FC<OntologyBuilderDialogProps> = ({
  isOpen,
  onClose,
  initialSeedConcepts = EMPTY_SEEDS,
}) => {
  const seeds = initialSeedConcepts.length ? initialSeedConcepts : EMPTY_SEEDS;
  const seedsKey = seeds.join('\0');

  const [contextCode] = useState(() => getUiContextCode());
  const [maxConcepts, setMaxConcepts] = useState(20);
  const [depth, setDepth] = useState<OntologyBuildDepth>('concepts+grounding');
  const [aspects, setAspects] = useState('domain');
  const [seedConcepts, setSeedConcepts] = useState(() => seeds.join(', '));
  const [concepts, setConcepts] = useState<OntologyConceptCandidate[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyOp>(null);
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const [materializeResult, setMaterializeResult] = useState<OntologyBuildMaterializeResponse | null>(null);
  const [applyResult, setApplyResult] = useState<OntologyBuildApplyResponse | null>(null);
  const [suggestElapsedSec, setSuggestElapsedSec] = useState(0);
  const [byoOpen, setByoOpen] = useState(false);
  const [byoTab, setByoTab] = useState<'export' | 'import'>('export');
  const [exportPack, setExportPack] = useState<import('../types').OntologyBuildExportPromptResponse | null>(null);
  const [importText, setImportText] = useState('');
  const [copyOk, setCopyOk] = useState<string | null>(null);

  /** Skip autosave once after restore (avoid save thrash / loops) */
  const skipNextAutosaveRef = useRef(false);
  const wasOpenRef = useRef(false);
  const lastDraftJsonRef = useRef<string>('');

  // Restore draft only when dialog opens (isOpen false → true)
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return; // already open — don't re-restore every parent render
    wasOpenRef.current = true;

    const draft = loadDraft(getUiContextCode());
    if (draft && draft.concepts.length > 0) {
      skipNextAutosaveRef.current = true;
      setMaxConcepts(draft.maxConcepts || 20);
      setDepth(draft.depth || 'concepts+grounding');
      setAspects(draft.aspects || 'domain');
      setSeedConcepts(
        draft.seedConcepts || (seedsKey ? seedsKey.split('\0').join(', ') : '')
      );
      setSource(draft.source);
      setConcepts(draft.concepts);
      setDraftSavedAt(draft.savedAt);
      lastDraftJsonRef.current = JSON.stringify({
        maxConcepts: draft.maxConcepts,
        depth: draft.depth,
        aspects: draft.aspects,
        seedConcepts: draft.seedConcepts,
        source: draft.source,
        concepts: draft.concepts,
      });
      setBanner({
        kind: 'info',
        title: `Восстановлен черновик (${draft.concepts.length} понятий)`,
        lines: [
          `Сохранён: ${new Date(draft.savedAt).toLocaleString()} · context: ${draft.contextCode}`,
          draft.source ? `Источник suggest: ${draft.source}` : '',
          'Можно править таблицу и сразу «Записать MD» / «Применить» — повторный Suggest не обязателен.',
          '«Очистить черновик» сбрасывает локальное сохранение (не трогает MD/БД).',
        ].filter(Boolean),
      });
    } else {
      setBanner(null);
      if (seedsKey) {
        setSeedConcepts(seedsKey.split('\0').join(', '));
      }
    }
  }, [isOpen, seedsKey]);

  // Auto-save draft (debounced); only when payload actually changes
  useEffect(() => {
    if (!isOpen || concepts.length === 0) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    const payload = {
      maxConcepts,
      depth,
      aspects,
      seedConcepts,
      source,
      concepts,
    };
    const json = JSON.stringify(payload);
    if (json === lastDraftJsonRef.current) return;
    lastDraftJsonRef.current = json;

    const savedAt = new Date().toISOString();
    const t = window.setTimeout(() => {
      saveDraft({
        contextCode: getUiContextCode(),
        savedAt,
        ...payload,
      });
      setDraftSavedAt(savedAt);
    }, 300);
    return () => window.clearTimeout(t);
  }, [isOpen, concepts, maxConcepts, depth, aspects, seedConcepts, source]);

  // Elapsed timer while busy (especially suggest)
  useEffect(() => {
    if (!busy) {
      setSuggestElapsedSec(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => {
      setSuggestElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [busy]);

  const acceptedConcepts = useMemo(
    () => concepts.filter((c) => c.accepted !== false),
    [concepts]
  );

  const handleClearDraft = () => {
    clearDraft(getUiContextCode());
    lastDraftJsonRef.current = '';
    skipNextAutosaveRef.current = true;
    setConcepts([]);
    setSource(null);
    setDraftSavedAt(null);
    setMaterializeResult(null);
    setApplyResult(null);
    setBanner({
      kind: 'info',
      title: 'Черновик очищен',
      lines: [
        'Локальное сохранение suggest сброшено. MD на диске и данные в БД не затронуты.',
        'Нажмите «Предложить» для нового черновика, либо «Применить» без таблицы — загрузка уже существующих concepts/*.md.',
      ],
    });
  };

  if (!isOpen) return null;

  const parseSeed = () =>
    seedConcepts
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const parseAspects = () =>
    aspects
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const applySuggestResult = (
    res: import('../types').OntologyBuildSuggestResponse,
    opts?: { titlePrefix?: string }
  ) => {
    setSource(res.source);
    const list = (res.concepts || []).map((c) => ({
      ...c,
      accepted: true,
      groundingCandidates: (c.groundingCandidates || []).map((g) => ({
        ...g,
        accepted: g.confidence >= 0.5,
      })),
    }));
    setConcepts(list);
    const modelLabel =
      res.model ||
      (res.source === 'external-llm' ? 'внешний чат (BYO)' : 'KOSMOS_MODEL (default)');
    const srcLabel =
      res.source === 'llm'
        ? 'встроенный LLM'
        : res.source === 'external-llm'
          ? 'внешний LLM (import)'
          : res.source;
    setBanner({
      kind: list.length ? 'success' : 'warning',
      title: list.length
        ? `${opts?.titlePrefix || 'Предложено понятий'}: ${list.length}`
        : 'Черновик пуст',
      lines: [
        `Источник: ${srcLabel}`,
        `Модель: ${modelLabel} · глубина: ${res.depth}`,
        list.length
          ? 'Отметьте нужные понятия → «Записать MD» / «Применить».'
          : 'Другой JSON или maxConcepts.',
      ],
    });
  };

  const handleSuggest = async () => {
    setBusy('suggest');
    setBanner(null);
    setApplyResult(null);
    setMaterializeResult(null);
    try {
      const res = await apiClient.ontologyBuildSuggest({
        maxConcepts,
        depth,
        aspects: parseAspects(),
        seedConcepts: parseSeed(),
      });
      applySuggestResult(res);
    } catch (e: any) {
      setConcepts([]);
      const code = e?.code || e?.data?.code;
      const isBadJson =
        code === 'LLM_BAD_JSON' ||
        /Unterminated string|битый|обрезанный JSON/i.test(errMessage(e));
      const isLlm =
        isBadJson || code === 'LLM_REQUIRED' || /LLM|ИИ|model/i.test(errMessage(e));
      setBanner({
        kind: 'error',
        title: isBadJson
          ? '«Без ИИ жизни нет!» — LLM вернул битый JSON'
          : isLlm
            ? '«Без ИИ жизни нет!» — suggest остановлен'
            : 'Suggest не удался',
        lines: [
          ...errMessage(e)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          isBadJson
            ? 'Или: «Внешняя LLM» → скопировать промпт → вставить ответ.'
            : isLlm
              ? 'Проверьте Settings / модель, либо используйте «Внешняя LLM».'
              : '',
        ].filter(Boolean),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleExportPrompt = async () => {
    setBusy('suggest');
    setBanner(null);
    try {
      const pack = await apiClient.ontologyBuildExportPrompt({
        maxConcepts,
        depth,
        aspects: parseAspects(),
        seedConcepts: parseSeed(),
      });
      setExportPack(pack);
      setByoTab('export');
      setByoOpen(true);
      setBanner({
        kind: 'info',
        title: 'Промпт для внешней LLM готов',
        lines: [
          `Якорей: ${pack.anchorsInPrompt}` +
            (pack.tablesInPrompt != null ? ` (tables: ${pack.tablesInPrompt})` : '') +
            `, maxConcepts: ${pack.maxConcepts}`,
          `seedMode: ${(pack as any).seedMode || 'user-only'}` +
            ` · avoid: ${(pack as any).seedAvoidCount ?? '—'}` +
            ` · existing listed: ${(pack as any).existingConceptsListed ?? '—'}`,
          'Скопируйте combined → внешний чат → «Вставить ответ». Ожидайте domain ids, не *-mutation.',
        ],
      });
    } catch (e: any) {
      setBanner({
        kind: 'error',
        title: 'Не удалось собрать промпт',
        lines: [errMessage(e)],
      });
    } finally {
      setBusy(null);
    }
  };

  const handleImportLlm = async () => {
    if (!importText.trim()) {
      setBanner({
        kind: 'warning',
        title: 'Вставьте ответ LLM',
        lines: ['Нужен JSON {"concepts":[...]} (можно из ```json блока).'],
      });
      return;
    }
    setBusy('suggest');
    setBanner(null);
    setApplyResult(null);
    setMaterializeResult(null);
    try {
      const res = await apiClient.ontologyBuildImport({
        text: importText,
        maxConcepts,
        depth,
        aspects: parseAspects(),
        seedConcepts: parseSeed(),
      });
      applySuggestResult(res, { titlePrefix: 'Импорт: понятий' });
      setByoOpen(false);
    } catch (e: any) {
      setBanner({
        kind: 'error',
        title: 'Импорт ответа LLM не удался',
        lines: [
          ...errMessage(e)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        ],
      });
    } finally {
      setBusy(null);
    }
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyOk(label);
      setTimeout(() => setCopyOk(null), 2000);
    } catch {
      setCopyOk('fail');
    }
  };

  const updateConcept = (idx: number, patch: Partial<OntologyConceptCandidate>) => {
    setConcepts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const toggleGrounding = (cIdx: number, gIdx: number) => {
    setConcepts((prev) =>
      prev.map((c, i) => {
        if (i !== cIdx) return c;
        const gs = [...(c.groundingCandidates || [])];
        gs[gIdx] = { ...gs[gIdx], accepted: !gs[gIdx].accepted };
        return { ...c, groundingCandidates: gs };
      })
    );
  };

  const preparePayload = (): OntologyConceptCandidate[] =>
    acceptedConcepts.map((c) => ({
      id: c.id,
      name: c.name,
      rationale: c.rationale,
      description: c.description || c.rationale,
      aspects: c.aspects,
      relations: c.relations,
      groundingCandidates: (c.groundingCandidates || []).filter((g) => g.accepted !== false),
    }));

  const handleMaterialize = async () => {
    const payload = preparePayload();
    if (!payload.length) {
      setBanner({
        kind: 'warning',
        title: 'Нечего записывать',
        lines: ['Нет принятых понятий (галочки в таблице). Сначала «Предложить» и отметьте нужные.'],
      });
      return;
    }
    const ambiguous = payload.flatMap((c) =>
      (c.groundingCandidates || []).filter((g) => g.confidence < 0.35)
    );
    if (ambiguous.length) {
      setBanner({
        kind: 'warning',
        title: 'Низкая уверенность grounding',
        lines: [
          `Целей с confidence < 35%: ${ambiguous.length}.`,
          'Снимите их в таблице или поправьте target, затем повторите запись.',
        ],
      });
      return;
    }

    setBusy('materialize');
    setBanner(null);
    setApplyResult(null);
    try {
      const res = await apiClient.ontologyBuildMaterialize({ concepts: payload });
      setMaterializeResult(res);
      const written = res.written || [];
      const skipped = (res as any).skippedExisting || [];
      const conflicts = res.conflicts || [];
      const kind: ResultBanner['kind'] =
        written.length && !conflicts.length
          ? 'success'
          : written.length || skipped.length
            ? 'warning'
            : conflicts.length
              ? 'error'
              : 'info';
      setBanner({
        kind,
        title:
          written.length > 0
            ? `MD записаны: ${written.length} файл(ов)`
            : skipped.length > 0
              ? `MD уже были: ${skipped.length} (пропущены)`
              : 'MD не записаны',
        lines: [
          `Каталог: ${res.outDir || '—'}`,
          res.dirsSource
            ? `Источник каталога: ${
                res.dirsSource === 'config'
                  ? 'kb-config onto_loading.dirs'
                  : res.dirsSource
              }`
            : '',
          res.warning || '',
          written.length
            ? `Новые: ${written.map((w) => `${w.id}.md`).join(', ')}`
            : '',
          skipped.length
            ? `Уже на диске: ${skipped.map((s: any) => s.id).join(', ')}`
            : '',
          conflicts.length
            ? `Конфликты: ${conflicts.map((c) => c.id).join(', ')}`
            : '',
          'Это только файлы на диске (status: draft). В БД — после «Применить».',
        ].filter(Boolean),
      });
    } catch (e: any) {
      const data = e?.data as OntologyBuildMaterializeResponse | undefined;
      setMaterializeResult(data || null);
      if (isOntoConfigError(e)) {
        setBanner({
          kind: 'warning',
          title: 'Стоп: не настроен onto_loading',
          lines: configErrorLines(e),
        });
      } else if (
        e?.code === 'CONCEPT_FILES_EXIST' ||
        e?.data?.code === 'CONCEPT_FILES_EXIST' ||
        e?.status === 409
      ) {
        const conflictIds =
          (e?.data?.conflicts || data?.conflicts || []).map((c: any) => c.id).filter(Boolean);
        setBanner({
          kind: 'warning',
          title: 'MD уже на диске',
          lines: [
            ...configErrorLines(e),
            conflictIds.length ? `Id: ${conflictIds.slice(0, 12).join(', ')}${conflictIds.length > 12 ? '…' : ''}` : '',
            'Нажмите «Применить» — загрузка пойдёт из существующих файлов без перезаписи.',
          ].filter(Boolean),
        });
      } else {
        const conflictIds = data?.conflicts?.map((c) => c.id).filter(Boolean) || [];
        setBanner({
          kind: 'error',
          title: 'Запись MD не удалась',
          lines: [
            errMessage(e),
            conflictIds.length
              ? `Конфликтующие id: ${conflictIds.join(', ')}`
              : '',
            data?.outDir ? `Каталог: ${data.outDir}` : '',
          ].filter(Boolean),
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async () => {
    const payload = preparePayload();
    setBusy('apply');
    setBanner(null);
    try {
      const res = await apiClient.ontologyBuildApply({
        concepts: payload.length ? payload : undefined,
      });
      setApplyResult(res);

      if (res.success) {
        const v = res.validate?.summary;
        setBanner({
          kind: v && !v.ok ? 'warning' : 'success',
          title: 'Применение завершено',
          lines: [
            res.materialize
              ? `1) MD: новых ${res.materialize.written?.length ?? 0}, уже были ${(res.materialize as any).skippedExisting?.length ?? 0} → ${res.materialize.outDir || ''}`
              : '1) MD: не передавались (load из onto_loading.dirs)',
            res.load
              ? `2) Загрузка в БД: ${res.load.success ? 'OK' : 'FAIL'}, понятий: ${res.load.conceptsLoaded ?? '—'}`
              : '2) Загрузка: —',
            res.vectorize
              ? `3) Векторизация concept:*: ${res.vectorize.vectorized ?? 0} / ${res.vectorize.totalChunks ?? 0}`
              : '3) Векторизация: —',
            v
              ? `4) Validate: broken=${v.brokenGrounding}, stale=${v.staleGroundingTargets}, без grounding=${v.conceptsWithoutGrounding}, ok=${v.ok}`
              : '4) Validate: —',
            v?.coverage ? `Coverage: ${v.coverage}` : '',
            'Онтология в PG обновлена; concept-first ask должен видеть новые/обновлённые понятия после векторизации.',
          ].filter(Boolean),
        });
      } else {
        setBanner({
          kind: 'error',
          title: `Применение прервано (${res.abortedAt || 'ошибка'})`,
          lines: [
            res.error?.message || 'См. детали ниже',
            ...(res.error?.errors || []).slice(0, 8),
            res.load && !res.load.success
              ? 'Загрузка MD в БД не прошла — векторизация и validate не запускались.'
              : '',
          ].filter(Boolean),
        });
      }

      if (res.validate?.details?.uncoveredSamples?.length) {
        const seeds = res.validate.details.uncoveredSamples
          .slice(0, 8)
          .map((s) => s.full_name)
          .join(', ');
        setSeedConcepts((prev) => (prev ? `${prev}, ${seeds}` : seeds));
      }
    } catch (e: any) {
      const data = e?.data as OntologyBuildApplyResponse | undefined;
      if (data && typeof data === 'object' && ('success' in data || 'load' in data || 'validate' in data)) {
        setApplyResult(data);
      } else {
        setApplyResult(null);
      }
      if (isOntoConfigError(e)) {
        setBanner({
          kind: 'warning',
          title: 'Стоп: не настроен onto_loading',
          lines: configErrorLines(e),
        });
      } else {
        setBanner({
          kind: 'error',
          title: 'Применение не удалось',
          lines: [
            errMessage(e),
            data?.abortedAt ? `Этап остановки: ${data.abortedAt}` : '',
            ...(data?.error?.errors || []).slice(0, 6),
            data?.load && data.load.success === false
              ? 'Загрузка MD в БД не прошла — векторизация и validate не выполнялись.'
              : '',
          ].filter(Boolean),
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const confidenceColor = (g: OntologyGroundingCandidate) =>
    g.confidence >= 0.7 ? 'text-green-400' : g.confidence >= 0.45 ? 'text-amber-400' : 'text-red-400';

  const bannerStyles: Record<ResultBanner['kind'], string> = {
    success: 'bg-emerald-900/30 border-emerald-600/50 text-emerald-100',
    warning: 'bg-amber-900/30 border-amber-600/50 text-amber-100',
    error: 'bg-red-900/30 border-red-600/50 text-red-100',
    info: 'bg-blue-900/30 border-blue-600/50 text-blue-100',
  };

  const busyCopy = busy ? BUSY_COPY[busy] : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Blocking wait overlay for long ops */}
        {busy && busyCopy && (
          <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-6">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <div className="text-white text-lg font-bold text-center">{busyCopy.title}</div>
            <p className="text-slate-300 text-sm text-center mt-2 max-w-md">{busyCopy.hint}</p>
            <p className="text-slate-500 text-xs mt-4 font-mono">
              {suggestElapsedSec}s · не закрывайте окно
            </p>
          </div>
        )}

        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-white">Ontology Builder (Step 6)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              suggest → review → materialize → apply (onto_loading + concept:* vectors + validate)
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={!!busy}
            className="text-slate-400 hover:text-white text-2xl leading-none disabled:opacity-30"
            title="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Config */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <label className="text-xs text-slate-400">
              maxConcepts
              <input
                type="number"
                min={1}
                max={30}
                value={maxConcepts}
                disabled={!!busy}
                onChange={(e) => setMaxConcepts(Number(e.target.value) || 20)}
                className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white disabled:opacity-50"
              />
            </label>
            <label className="text-xs text-slate-400">
              depth
              <select
                value={depth}
                disabled={!!busy}
                onChange={(e) => setDepth(e.target.value as OntologyBuildDepth)}
                className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white disabled:opacity-50"
              >
                {DEPTH_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 md:col-span-1">
              aspects
              <input
                value={aspects}
                disabled={!!busy}
                onChange={(e) => setAspects(e.target.value)}
                className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white disabled:opacity-50"
                placeholder="domain, storage"
              />
            </label>
            <label className="text-xs text-slate-400 md:col-span-1">
              seedConcepts
              <input
                value={seedConcepts}
                disabled={!!busy}
                onChange={(e) => setSeedConcepts(e.target.value)}
                className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white disabled:opacity-50"
                placeholder="auction, bid"
              />
            </label>
          </div>

          {/* Numbered action groups: 1 = get draft (same step, two channels), 2 = MD, 3 = apply */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-stretch gap-2">
              {/* Step 1 — draft via built-in or external LLM */}
              <div className="flex flex-col gap-1.5 rounded-lg border border-blue-500/40 bg-blue-950/30 p-2 min-w-[11rem]">
                <div className="text-[10px] font-bold uppercase tracking-wide text-blue-300/90">
                  1 · Черновик (suggest)
                </div>
                <p className="text-[10px] text-slate-500 leading-snug max-w-[14rem]">
                  Один шаг: получить concepts. Либо встроенный LLM, либо свой чат (промпт → ответ).
                </p>
                <button
                  onClick={handleSuggest}
                  disabled={!!busy}
                  className="px-3 py-1.5 rounded text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                  title="Встроенный kosmos-model (тот же pipeline, что import)"
                >
                  {concepts.length ? 'Обновить (встроенный LLM)' : 'Предложить (встроенный LLM)'}
                </button>
                <button
                  onClick={() => {
                    setByoOpen(true);
                    setByoTab('export');
                    if (!exportPack) handleExportPrompt();
                  }}
                  disabled={!!busy}
                  className="px-3 py-1.5 rounded text-xs font-bold text-white bg-violet-700 hover:bg-violet-600 disabled:opacity-50"
                  title="Скопировать промпт → внешний чат → вставить JSON (как Suggest)"
                >
                  Внешняя LLM…
                </button>
              </div>

              {/* Step 2 — materialize */}
              <div className="flex flex-col gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/25 p-2 min-w-[10rem]">
                <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-300/90">
                  2 · Файлы MD
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">Запись concepts/*.md (draft)</p>
                <button
                  onClick={handleMaterialize}
                  disabled={!!busy || !acceptedConcepts.length}
                  className="px-3 py-1.5 rounded text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                  title={
                    acceptedConcepts.length
                      ? 'Только запись MD на диск (без загрузки в БД)'
                      : 'Нужен черновик из шага 1'
                  }
                >
                  Записать MD
                </button>
              </div>

              {/* Step 3 — apply */}
              <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/25 p-2 min-w-[10rem]">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">
                  3 · В БД
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">load + vectors + validate</p>
                <button
                  onClick={handleApply}
                  disabled={!!busy}
                  className="px-3 py-1.5 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                  title={
                    acceptedConcepts.length
                      ? 'MD (если есть) → БД → vectors → validate'
                      : 'Без таблицы: load существующих MD → vectors → validate'
                  }
                >
                  Применить
                </button>
              </div>

              {concepts.length > 0 && (
                <div className="flex flex-col gap-1.5 justify-end p-2">
                  <button
                    onClick={handleClearDraft}
                    disabled={!!busy}
                    className="px-3 py-1.5 rounded text-xs font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                    title="Сбросить локальный черновик"
                  >
                    Очистить черновик
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
              {source && <span>источник: {source}</span>}
              {draftSavedAt && concepts.length > 0 && (
                <span className="text-emerald-500/80">
                  черновик · {new Date(draftSavedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            <b className="text-slate-400">1</b> — один шаг «получить concepts» (встроенный LLM или внешний чат).{' '}
            <b className="text-slate-400">2</b> — MD на диск.{' '}
            <b className="text-slate-400">3</b> — load + vectors + validate. Черновик: localStorage (
            {contextCode}). Промпты: System Settings → Ontology Builder.
          </p>

          {/* BYO external LLM panel */}
          {byoOpen && (
            <div className="border border-violet-600/40 bg-slate-900/80 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-violet-200">
                  Внешняя LLM (как кнопка Suggest)
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white text-lg leading-none"
                  onClick={() => setByoOpen(false)}
                  title="Скрыть"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className={`px-2 py-1 rounded ${byoTab === 'export' ? 'bg-violet-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                  onClick={() => setByoTab('export')}
                >
                  1. Промпт
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 rounded ${byoTab === 'import' ? 'bg-violet-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                  onClick={() => setByoTab('import')}
                >
                  2. Вставить ответ
                </button>
              </div>

              {byoTab === 'export' && (
                <div className="space-y-2 text-xs text-slate-300">
                  <p className="text-slate-400">
                    Собираем те же system/user, что ушёл бы во встроенный Suggest (якоря + settings).
                    LLM на сервере <b>не</b> вызывается.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={handleExportPrompt}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white font-medium disabled:opacity-50"
                    >
                      {exportPack ? 'Обновить промпт' : 'Собрать промпт'}
                    </button>
                    {exportPack && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyText('combined', exportPack.combinedForChat)}
                          className="px-2 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-white font-medium"
                        >
                          Копировать всё (chat)
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText('system', exportPack.systemPrompt)}
                          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          System
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText('user', exportPack.userPrompt)}
                          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          User
                        </button>
                      </>
                    )}
                    {copyOk && copyOk !== 'fail' && (
                      <span className="text-emerald-400 self-center">Скопировано: {copyOk}</span>
                    )}
                    {copyOk === 'fail' && (
                      <span className="text-red-400 self-center">Clipboard недоступен — выделите вручную</span>
                    )}
                  </div>
                  {exportPack && (
                    <textarea
                      readOnly
                      value={exportPack.combinedForChat}
                      rows={12}
                      className="w-full bg-slate-950 border border-slate-600 rounded px-2 py-1.5 text-[11px] font-mono text-slate-200"
                    />
                  )}
                </div>
              )}

              {byoTab === 'import' && (
                <div className="space-y-2 text-xs text-slate-300">
                  <p className="text-slate-400">
                    Вставьте JSON <code className="text-slate-200">{'{"concepts":[...]}'}</code> из внешнего
                    чата. Дальше — grounding/relations как после Suggest.
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={10}
                    placeholder='{"concepts":[{"id":"...","name":"...","rationale":"...","aspects":["domain"],"anchorFullNames":["..."]}]}'
                    className="w-full bg-slate-950 border border-slate-600 rounded px-2 py-1.5 text-[11px] font-mono text-white"
                  />
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={handleImportLlm}
                    className="px-3 py-1.5 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Импортировать как Suggest
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Result banner — always visible after action */}
          {banner && (
            <div className={`border rounded-lg p-3 text-sm ${bannerStyles[banner.kind]}`}>
              <div className="font-bold text-base mb-1 flex items-center gap-2">
                <span>
                  {banner.kind === 'success' && '✓'}
                  {banner.kind === 'warning' && '!'}
                  {banner.kind === 'error' && '✕'}
                  {banner.kind === 'info' && 'i'}
                </span>
                {banner.title}
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs opacity-95">
                {banner.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {materializeResult?.written && materializeResult.written.length > 0 && banner.title.includes('MD') && (
                <div className="mt-2 text-[11px] font-mono opacity-80 max-h-24 overflow-y-auto">
                  {materializeResult.written.map((w) => (
                    <div key={w.path}>{w.path}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Candidates table */}
          {concepts.length > 0 && (
            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2">✓</th>
                    <th className="p-2">id</th>
                    <th className="p-2">name</th>
                    <th className="p-2">rationale</th>
                    <th className="p-2">relations</th>
                    <th className="p-2">grounding</th>
                  </tr>
                </thead>
                <tbody>
                  {concepts.map((c, idx) => (
                    <tr key={`${c.id}-${idx}`} className="border-t border-slate-700 align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={c.accepted !== false}
                          disabled={!!busy}
                          onChange={(e) => updateConcept(idx, { accepted: e.target.checked })}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={c.id}
                          disabled={!!busy}
                          onChange={(e) => updateConcept(idx, { id: e.target.value })}
                          className="w-28 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-white font-mono disabled:opacity-50"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={c.name}
                          disabled={!!busy}
                          onChange={(e) => updateConcept(idx, { name: e.target.value })}
                          className="w-32 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-white disabled:opacity-50"
                        />
                      </td>
                      <td className="p-2 text-slate-300 max-w-xs">{c.rationale}</td>
                      <td className="p-2 text-slate-400">
                        {(c.relations || []).map((r, i) => (
                          <div key={i}>
                            {r.type} → {r.target}
                          </div>
                        ))}
                      </td>
                      <td className="p-2 space-y-1">
                        {(c.groundingCandidates || []).map((g, gi) => (
                          <label key={gi} className="flex items-start gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={g.accepted !== false}
                              disabled={!!busy}
                              onChange={() => toggleGrounding(idx, gi)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="text-slate-200">{g.role}</span>{' '}
                              <span className="font-mono text-slate-300">{g.target}</span>{' '}
                              <span className={confidenceColor(g)}>
                                {(g.confidence * 100).toFixed(0)}%
                              </span>
                              <span className="block text-[10px] text-slate-500">{g.source}</span>
                            </span>
                          </label>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detailed apply phases */}
          {applyResult && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 space-y-2">
              <div className="font-bold text-white text-sm">Детали apply</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-slate-800/60 rounded p-2">
                  <div className="text-slate-400 uppercase text-[10px]">Materialize</div>
                  {applyResult.materialize ? (
                    <div>
                      записано: {applyResult.materialize.written?.length ?? 0}
                      {applyResult.materialize.conflicts?.length
                        ? `, конфликтов: ${applyResult.materialize.conflicts.length}`
                        : ''}
                    </div>
                  ) : (
                    <div className="text-slate-500">не вызывался / без concepts</div>
                  )}
                </div>
                <div className="bg-slate-800/60 rounded p-2">
                  <div className="text-slate-400 uppercase text-[10px]">Load (onto_loading)</div>
                  {applyResult.load ? (
                    <div>
                      {applyResult.load.success ? 'OK' : 'FAIL'} · понятий:{' '}
                      {applyResult.load.conceptsLoaded ?? '—'}
                    </div>
                  ) : (
                    <div className="text-slate-500">—</div>
                  )}
                </div>
                <div className="bg-slate-800/60 rounded p-2">
                  <div className="text-slate-400 uppercase text-[10px]">Vectorize concept:*</div>
                  {applyResult.vectorize ? (
                    <div>
                      {applyResult.vectorize.vectorized ?? 0} / {applyResult.vectorize.totalChunks ?? 0}
                      {applyResult.vectorize.batchErrors
                        ? ` · ошибки батчей: ${applyResult.vectorize.batchErrors}`
                        : ''}
                    </div>
                  ) : (
                    <div className="text-slate-500">—</div>
                  )}
                </div>
                <div className="bg-slate-800/60 rounded p-2">
                  <div className="text-slate-400 uppercase text-[10px]">Validate</div>
                  {applyResult.validate?.summary ? (
                    <div>
                      ok={String(applyResult.validate.summary.ok)} · broken=
                      {applyResult.validate.summary.brokenGrounding} · noGround=
                      {applyResult.validate.summary.conceptsWithoutGrounding}
                    </div>
                  ) : (
                    <div className="text-slate-500">—</div>
                  )}
                </div>
              </div>
              {applyResult.validate?.details?.uncoveredSamples &&
                applyResult.validate.details.uncoveredSamples.length > 0 && (
                  <div>
                    <div className="text-amber-300 font-semibold mb-1">
                      Непокрытые items (добавлены в seedConcepts для следующего suggest):
                    </div>
                    <ul className="list-disc pl-4 text-slate-400">
                      {applyResult.validate.details.uncoveredSamples.slice(0, 12).map((s) => (
                        <li key={s.full_name}>
                          {s.full_name} ({s.type}, chunks={s.chunks})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OntologyBuilderDialog;
