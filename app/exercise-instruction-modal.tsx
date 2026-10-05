import { useEffect, useState } from 'react';
import { exerciseLibrary, type WorkoutExercise } from './reppy-data';
import Icon from './ui-icon';
import ModalFrame from './modal-frame';
import { ActionButton, FormError } from './ui-controls';
import { loadInstructionVideo, saveInstructionVideo } from './instruction-video-repository';
import { clearUiDraft, loadUiDraft, saveUiDraft } from './ui-persistence';

const MAX_INSTRUCTION_VIDEO_BYTES = 100 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

export default function ExerciseInstructionModal({
  exercise,
  studentId,
  editable = false,
  persistenceKey,
  onClose,
  onSave,
}: {
  exercise: WorkoutExercise;
  studentId?: string;
  editable?: boolean;
  persistenceKey?: string;
  onClose: () => void;
  onSave?: (patch: Pick<WorkoutExercise, 'instructionText' | 'instructionVideo'>) => void;
}) {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const resolvedEquipment = exercise.equipment ?? definition?.equipment;
  const equipment = resolvedEquipment && resolvedEquipment !== 'Свой вес' ? resolvedEquipment : null;
  const draftKey = persistenceKey ?? `instruction:${exercise.id}`;
  const [instructionText, setInstructionText] = useState(() => loadUiDraft<{ instructionText: string }>(draftKey)?.instructionText ?? exercise.instructionText ?? '');
  const [instructionVideo, setInstructionVideo] = useState(exercise.instructionVideo);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMissing, setVideoMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (instructionText === (exercise.instructionText ?? '')) clearUiDraft(draftKey);
    else saveUiDraft(draftKey, { instructionText });
  }, [draftKey, exercise.instructionText, instructionText]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setVideoMissing(false);
      setVideoUrl(null);
      if (pendingFile) {
        objectUrl = URL.createObjectURL(pendingFile);
        setVideoUrl(objectUrl);
        return;
      }
      if (!instructionVideo) return;
      try {
        const blob = await loadInstructionVideo(instructionVideo.id);
        if (cancelled) return;
        if (!blob) return setVideoMissing(true);
        objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
      } catch {
        if (!cancelled) setVideoMissing(true);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [instructionVideo, pendingFile]);

  const chooseVideo = (file?: File) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('video/')) return setError('Выбери видеофайл.');
    if (file.size > MAX_INSTRUCTION_VIDEO_BYTES) return setError('Видео должно быть не больше 100 МБ.');
    setPendingFile(file);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const nextVideo = pendingFile ? await saveInstructionVideo(pendingFile, studentId) : instructionVideo;
      clearUiDraft(draftKey);
      onSave?.({ instructionText: instructionText.trim() || undefined, instructionVideo: nextVideo });
      onClose();
    } catch {
      setError('Не удалось сохранить видео. Попробуй ещё раз.');
      setSaving(false);
    }
  };

  const instruction = exercise.instructionText?.trim();
  return (
    <ModalFrame title={exercise.name} className="exercise-instruction-sheet" ariaLabel={'Как выполнять — ' + exercise.name} closeLabel="Закрыть описание" onClose={onClose}>
      <div className="exercise-instruction-body">
        <div className={`exercise-instruction-media ${videoUrl ? 'has-video' : ''}`}>
          {videoUrl
            ? <video controls playsInline preload="metadata" src={videoUrl} aria-label={'Видео упражнения — ' + exercise.name} />
            : <><Icon name="workout" /><span>{videoMissing ? 'Видео недоступно в этом браузере' : editable ? 'Добавь короткое видео с техникой' : 'Тренер пока не добавил видео'}</span></>}
        </div>
        {editable && <div className="instruction-video-actions">
          <label className="wide-secondary">
            <Icon name={instructionVideo || pendingFile ? 'change' : 'plus'} />
            <span>{instructionVideo || pendingFile ? 'Заменить видео' : 'Записать или выбрать видео'}</span>
            <input type="file" accept="video/*" onChange={(event) => chooseVideo(event.target.files?.[0])} />
          </label>
          {(instructionVideo || pendingFile) && <button type="button" className="instruction-video-remove" onClick={() => { setInstructionVideo(undefined); setPendingFile(null); setError(''); }}><Icon name="trash" /> Удалить</button>}
        </div>}
        {(instructionVideo || pendingFile) && <p className="instruction-video-meta">{pendingFile?.name ?? instructionVideo?.name} · {formatFileSize(pendingFile?.size ?? instructionVideo?.size ?? 0)}</p>}
        {editable && <p className="instruction-video-helper">Короткий ролик: 2–3 повтора, до 100 МБ.</p>}
        {equipment && <div className="exercise-equipment"><small>ОБОРУДОВАНИЕ</small><strong>{equipment}</strong></div>}
        <h3>Как выполнять</h3>
        {editable
          ? <textarea className="instruction-textarea" aria-label="Подробное описание упражнения" maxLength={1500} value={instructionText} onChange={(event) => setInstructionText(event.target.value)} placeholder="Опиши исходное положение, движение, дыхание и требования к технике" />
          : instruction
            ? <p className="instruction-copy">{instruction}</p>
            : <p className="instruction-empty">Подробное описание пока не добавлено. Выполняй движение плавно и остановись при резкой боли.</p>}
        {error && <FormError>{error}</FormError>}
        {editable && <ActionButton icon="check" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем…' : 'Сохранить инструкцию'}</ActionButton>}
      </div>
    </ModalFrame>
  );
}
