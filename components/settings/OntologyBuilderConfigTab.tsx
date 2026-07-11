import React, { useEffect, useState } from 'react';
import { AppConfig, OntologyBuilderConfig } from '../../types';

interface OntologyBuilderConfigTabProps {
  config: AppConfig | null;
  /** Full factory prompts from GET /api/config → factory.ontology_builder */
  factoryOntologyBuilder?: OntologyBuilderConfig | null;
  loading: boolean;
  error: string | null;
  validationErrors: string[];
  onSave: (updates: Partial<AppConfig>) => Promise<boolean>;
}

const emptyOb = (): OntologyBuilderConfig => ({
  model: null,
  maxConcepts: 10,
  depth: 'concepts+grounding',
  temperature: 0,
  systemPrompt: '',
  userPromptTemplate: '',
  descriptionSystemPrompt: '',
  descriptionPrompt: '',
  outputRulesSuffix: '',
  retrySystemPrompt: '',
  retryUserTemplate: '',
  byoInstruction: '',
  excludeNamePatterns: [],
  enableDescriptionPass: false,
  seedMode: 'user-only',
});

export const OntologyBuilderConfigTab: React.FC<OntologyBuilderConfigTabProps> = ({
  config,
  factoryOntologyBuilder = null,
  loading,
  error,
  validationErrors,
  onSave,
}) => {
  const [form, setForm] = useState<OntologyBuilderConfig>(emptyOb());
  const [excludeText, setExcludeText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (config?.ontology_builder) {
      // API returns normalized prompts (never blank) — show real text for editing
      const ob = { ...emptyOb(), ...config.ontology_builder };
      setForm(ob);
      setExcludeText((ob.excludeNamePatterns || []).join('\n'));
      setHasChanges(false);
    } else if (config) {
      setForm(emptyOb());
      setExcludeText('');
      setHasChanges(false);
    }
  }, [config]);

  const patch = (partial: Partial<OntologyBuilderConfig>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setHasChanges(true);
    setMessage(null);
  };

  const applyFactoryToForm = () => {
    const factory = factoryOntologyBuilder || emptyOb();
    setForm({ ...emptyOb(), ...factory });
    setExcludeText((factory.excludeNamePatterns || []).join('\n'));
    setHasChanges(true);
    setMessage(
      'В форму подставлены factory-defaults. Нажмите Save, чтобы записать их в config.json.'
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const excludeNamePatterns = excludeText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: OntologyBuilderConfig = {
      ...form,
      model: form.model && String(form.model).trim() ? String(form.model).trim() : null,
      excludeNamePatterns,
      maxConcepts: Math.min(30, Math.max(1, Number(form.maxConcepts) || 12)),
      temperature: Math.min(2, Math.max(0, Number(form.temperature) || 0)),
      systemPrompt: form.systemPrompt || '',
      userPromptTemplate: form.userPromptTemplate || '',
      descriptionPrompt: form.descriptionPrompt || '',
    };
    const ok = await onSave({ ontology_builder: payload });
    setSaving(false);
    if (ok) {
      setHasChanges(false);
      setMessage('Ontology Builder settings saved. Suggest uses these prompts immediately.');
    }
  };

  const handleResetSection = async () => {
    if (
      !window.confirm(
        'Сбросить Ontology Builder к factory-defaults (промпты + knobs)?\nОстальные App Config поля не трогаются.'
      )
    ) {
      return;
    }
    const factory = factoryOntologyBuilder;
    if (!factory || !factory.systemPrompt) {
      setMessage(
        'Factory defaults не пришли с API. Перезагрузите Settings (backend с factory.ontology_builder).'
      );
      return;
    }
    setSaving(true);
    setMessage(null);
    const ok = await onSave({
      ontology_builder: {
        ...factory,
        model: null,
      },
    });
    setSaving(false);
    if (ok) {
      setHasChanges(false);
      setMessage('Сброшено к factory-defaults и сохранено.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-slate-400 text-sm">Loading settings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
        <h3 className="text-red-400 font-medium text-sm mb-1">Error</h3>
        <p className="text-red-300 text-xs">{error}</p>
      </div>
    );
  }

  if (!config) {
    return <div className="text-slate-400 text-sm">No configuration loaded</div>;
  }

  const globalModel = config.KOSMOS_MODEL || '—';
  const sysLen = (form.systemPrompt || '').length;
  const userLen = (form.userPromptTemplate || '').length;

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1">
        <p>
          Промпты <b className="text-slate-200">suggest</b> (Ontology Builder / Step 6). Редактируйте
          прямо здесь → <b className="text-slate-200">Save</b> → следующий Suggest подхватывает.
        </p>
        <p>
          Сейчас в форме: system <span className="text-slate-300">{sysLen}</span> симв., user{' '}
          <span className="text-slate-300">{userLen}</span> симв.
          {sysLen === 0 || userLen === 0 ? (
            <span className="text-amber-400">
              {' '}
              — пусто: нажмите «Подставить factory defaults» или перезапустите backend.
            </span>
          ) : null}
        </p>
        <p className="text-[10px] text-slate-500">
          Плейсхолдеры user template: {'{{maxConcepts}}'} {'{{contextCode}}'} {'{{seedConcepts}}'}{' '}
          {'{{anchors}}'} {'{{concepts}}'}. Model пустой → {globalModel}.
        </p>
      </div>

      {validationErrors.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
          <h3 className="text-red-400 font-medium text-xs mb-1.5">Validation Errors:</h3>
          <ul className="list-disc list-inside space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-red-300 text-xs">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-2 text-xs text-emerald-200">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs text-slate-400 block">
          Model (override)
          <input
            value={form.model ?? ''}
            onChange={(e) => patch({ model: e.target.value || null })}
            placeholder={`default: ${globalModel}`}
            className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400 block">
          maxConcepts (default for suggest)
          <input
            type="number"
            min={1}
            max={30}
            value={form.maxConcepts ?? 12}
            onChange={(e) => patch({ maxConcepts: Number(e.target.value) || 12 })}
            className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400 block">
          depth
          <select
            value={form.depth || 'concepts+grounding'}
            onChange={(e) =>
              patch({ depth: e.target.value as OntologyBuilderConfig['depth'] })
            }
            className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="concepts+grounding">concepts+grounding</option>
            <option value="concepts">concepts</option>
          </select>
        </label>
        <label className="text-xs text-slate-400 block">
          temperature
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature ?? 0}
            onChange={(e) => patch({ temperature: Number(e.target.value) })}
            className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400 block md:col-span-2">
          seedMode (что попадает в avoid-list промпта)
          <select
            value={form.seedMode || 'user-only'}
            onChange={(e) =>
              patch({ seedMode: e.target.value as OntologyBuilderConfig['seedMode'] })
            }
            className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white"
          >
            <option value="user-only">
              user-only (рекомендуется) — не сваливать все concept ids из БД в seed
            </option>
            <option value="all-existing">
              all-existing (legacy) — avoid = все concepts в контексте (порождает *-ops-service)
            </option>
          </select>
          <span className="block text-[10px] text-slate-500 mt-0.5">
            user-only: модель может reuse id employee/department/skill. all-existing: модель
            изобретает employee-ops-service, потому что employee «занят».
          </span>
        </label>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 space-y-1.5">
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.enableDescriptionPass}
            onChange={(e) => patch({ enableDescriptionPass: e.target.checked })}
          />
          <span>Second LLM pass for concept descriptions</span>
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-500 text-[10px] font-bold text-slate-300 hover:bg-slate-700 hover:border-blue-400 hover:text-blue-300 cursor-help shrink-0"
            title={
              'Второй вызов LLM после кластеризации понятий.\n\n' +
              'Без галочки: один проход — id/name/anchors + короткий rationale.\n' +
              'С галочкой: ещё один запрос пишет нормальные русские описания (2–4 предложения).\n\n' +
              'Плюс: лучше тексты в MD и в таблице ревью.\n' +
              'Минус: дольше и дороже; при ошибке LLM — suggest останавливается («Без ИИ жизни нет!»).\n\n' +
              'Промпт 2-го прохода — поле Description prompt ниже.'
            }
            role="img"
            aria-label="Справка: второй проход LLM"
          >
            i
          </span>
        </label>
        <p className="text-[10px] text-slate-500 pl-6 leading-relaxed">
          После нарезки concepts — отдельный LLM-запрос на человекочитаемые описания. Медленнее,
          зато rationale не «сгруппировано N якорей». При сбое модели suggest падает, не молчит.
        </p>
      </div>

      <p className="text-[10px] text-amber-200/80 bg-amber-950/30 border border-amber-700/40 rounded px-2 py-1.5">
        Все тексты для LLM — <b>только здесь</b> (config.json → ontology_builder). Runtime не берёт
        промпты из хардкода routes; factory — лишь стартовый шаблон («Подставить factory defaults»).
      </p>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">System prompt</span>
        <span className="text-[10px] text-slate-500 ml-2">suggest · system</span>
        <textarea
          value={form.systemPrompt || ''}
          onChange={(e) => patch({ systemPrompt: e.target.value })}
          rows={10}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">User prompt template</span>
        <span className="text-[10px] text-slate-500 ml-2">
          {'{{anchors}}'} {'{{seedConcepts}}'} {'{{existingConcepts}}'} {'{{maxConcepts}}'}{' '}
          {'{{contextCode}}'}
        </span>
        <textarea
          value={form.userPromptTemplate || ''}
          onChange={(e) => patch({ userPromptTemplate: e.target.value })}
          rows={12}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">Output rules suffix</span>
        <span className="text-[10px] text-slate-500 ml-2">добавляется в конец user (suggest + export)</span>
        <textarea
          value={form.outputRulesSuffix || ''}
          onChange={(e) => patch({ outputRulesSuffix: e.target.value })}
          rows={6}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">Retry system prompt</span>
        <span className="text-[10px] text-slate-500 ml-2">если JSON обрезан / битый</span>
        <textarea
          value={form.retrySystemPrompt || ''}
          onChange={(e) => patch({ retrySystemPrompt: e.target.value })}
          rows={4}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">Retry user template</span>
        <span className="text-[10px] text-slate-500 ml-2">короткий retry-промпт</span>
        <textarea
          value={form.retryUserTemplate || ''}
          onChange={(e) => patch({ retryUserTemplate: e.target.value })}
          rows={6}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">BYO instruction</span>
        <span className="text-[10px] text-slate-500 ml-2">футер «Внешняя LLM» (export)</span>
        <textarea
          value={form.byoInstruction || ''}
          onChange={(e) => patch({ byoInstruction: e.target.value })}
          rows={3}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">Description system prompt</span>
        <span className="text-[10px] text-slate-500 ml-2">2nd pass system</span>
        <textarea
          value={form.descriptionSystemPrompt || ''}
          onChange={(e) => patch({ descriptionSystemPrompt: e.target.value })}
          rows={2}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        <span className="text-slate-200 font-medium">Description user prompt</span>
        <span className="text-[10px] text-slate-500 ml-2">2nd pass user · {'{{concepts}}'}</span>
        <textarea
          value={form.descriptionPrompt || ''}
          onChange={(e) => patch({ descriptionPrompt: e.target.value })}
          rows={6}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono leading-relaxed"
        />
      </label>

      <label className="text-xs text-slate-400 block">
        Exclude name patterns (one regex per line)
        <span className="block text-[10px] text-slate-500 mb-0.5">
          Anchors matching any pattern are dropped before suggest (tables always kept).
        </span>
        <textarea
          value={excludeText}
          onChange={(e) => {
            setExcludeText(e.target.value);
            setHasChanges(true);
            setMessage(null);
          }}
          rows={5}
          className="mt-0.5 w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white font-mono"
        />
      </label>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-700">
        <button
          type="submit"
          disabled={!hasChanges || saving}
          className="px-3 py-1.5 rounded text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Ontology Builder'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={applyFactoryToForm}
          className="px-3 py-1.5 rounded text-xs font-bold text-slate-100 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40"
          title="Показать factory-defaults в полях (нужен Save)"
        >
          Подставить factory defaults
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleResetSection}
          className="px-3 py-1.5 rounded text-xs font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
          title="Сразу записать factory-defaults в config.json"
        >
          Reset &amp; Save factory
        </button>
        {hasChanges && (
          <span className="text-xs text-amber-400 self-center">Unsaved changes</span>
        )}
      </div>
    </form>
  );
};

export default OntologyBuilderConfigTab;
