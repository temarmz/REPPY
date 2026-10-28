import { Box, Video, Inline, Label, Paragraph, Small, Strong, Subheading } from './elements';
import { useEffect, useRef, useState } from 'react';
import { exerciseLibrary, type WorkoutExercise } from '../reppy-data';
import Icon from './icon';
import ModalFrame from './modal-frame';
import { ActionButton, FormError, Button, Input, Textarea } from './controls';
import { loadInstructionVideo, saveInstructionVideo } from '../instruction-video-repository';
import { clearUiDraft, loadUiDraft, saveUiDraft } from '../ui-persistence';

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
  const [instructionText, setInstructionText] = useState(() => {
    const draft = loadUiDraft(draftKey);
    return typeof draft?.instructionText === 'string' ? draft.instructionText : exercise.instructionText ?? '';
  });
  const [instructionVideo, setInstructionVideo] = useState(exercise.instructionVideo);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMissing, setVideoMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveRequest = useRef<object | null>(null);

  useEffect(() => () => { saveRequest.current = null; }, []);
  const close = () => { saveRequest.current = null; onClose(); };

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
    if (saveRequest.current) return;
    const request = {};
    saveRequest.current = request;
    setSaving(true);
    setError('');
    try {
      const nextVideo = pendingFile ? await saveInstructionVideo(pendingFile, studentId) : instructionVideo;
      if (saveRequest.current !== request) return;
      onSave?.({ instructionText: instructionText.trim() || undefined, instructionVideo: nextVideo });
      clearUiDraft(draftKey);
      onClose();
    } catch {
      if (saveRequest.current !== request) return;
      setError('Не удалось сохранить видео. Попробуй ещё раз.');
    } finally {
      if (saveRequest.current === request) {
        saveRequest.current = null;
        setSaving(false);
      }
    }
  };

  const instruction = exercise.instructionText?.trim();
  return (
    <ModalFrame title={exercise.name} className="exercise-instruction-sheet" ariaLabel={'Как выполнять — ' + exercise.name} closeLabel="Закрыть описание" onClose={close}>
      <Box className="exercise-instruction-body">
        <Box className={`exercise-instruction-media ${videoUrl ? 'has-video' : ''}`}>
          {videoUrl
            ? <Video controls playsInline preload="metadata" src={videoUrl} aria-label={'Видео упражнения — ' + exercise.name} />
            : <><Icon name="workout" /><Inline>{videoMissing ? 'Видео недоступно в этом браузере' : editable ? 'Добавь короткое видео с техникой' : 'Тренер пока не добавил видео'}</Inline></>}
        </Box>
        {editable && <Box className="instruction-video-actions">
          <Label className="wide-secondary">
            <Icon name={instructionVideo || pendingFile ? 'change' : 'plus'} />
            <Inline>{instructionVideo || pendingFile ? 'Заменить видео' : 'Записать или выбрать видео'}</Inline>
            <Input type="file" accept="video/*" disabled={saving} onChange={(event) => chooseVideo(event.target.files?.[0])} />
          </Label>
          {(instructionVideo || pendingFile) && <Button type="button" className="instruction-video-remove" disabled={saving} onClick={() => { setInstructionVideo(undefined); setPendingFile(null); setError(''); }}><Icon name="trash" /> Удалить</Button>}
        </Box>}
        {(instructionVideo || pendingFile) && <Paragraph className="instruction-video-meta">{pendingFile?.name ?? instructionVideo?.name} · {formatFileSize(pendingFile?.size ?? instructionVideo?.size ?? 0)}</Paragraph>}
        {editable && <Paragraph className="instruction-video-helper">Короткий ролик: 2–3 повтора, до 100 МБ.</Paragraph>}
        {equipment && <Box className="exercise-equipment"><Small>ОБОРУДОВАНИЕ</Small><Strong>{equipment}</Strong></Box>}
        <Subheading>Как выполнять</Subheading>
        {editable
          ? <Textarea className="instruction-textarea" aria-label="Подробное описание упражнения" disabled={saving} maxLength={1500} value={instructionText} onChange={(event) => setInstructionText(event.target.value)} placeholder="Опиши исходное положение, движение, дыхание и требования к технике" />
          : instruction
            ? <Paragraph className="instruction-copy">{instruction}</Paragraph>
            : <Paragraph className="instruction-empty">Подробное описание пока не добавлено. Выполняй движение плавно и остановись при резкой боли.</Paragraph>}
        {error && <FormError>{error}</FormError>}
        {editable && <ActionButton icon="check" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем…' : 'Сохранить инструкцию'}</ActionButton>}
      </Box>
    </ModalFrame>
  );
}
