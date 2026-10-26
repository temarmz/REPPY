import ProgressChart from './progress-chart';
import * as elements from './elements';
import * as controls from './controls';
import * as patterns from './patterns';
import Icon from './icon';
import Avatar, { InitialsAvatar } from './avatar';
import PageHeader from './page-header';
import ModalFrame from './modal-frame';
import ConfirmationModal from './confirmation-modal';
import EmptyState from './empty-state';
import AppShell from './app-shell';
import { AppErrorBoundary, AppStatusBanner, DataLoadError } from './app-status';
import MonthDatePicker from './month-date-picker';
import WorkoutScheduleFields, { DatePickerField } from './workout-schedule-fields';
import ReadOnlyExerciseList from './read-only-exercise-list';
import { ActiveExerciseCard, PlanExerciseCard } from './workout-exercise-card';
import ExerciseInstructionModal from './exercise-instruction-modal';

/** Actual component references: the design-kit inventory cannot drift from this registry. */
export const UI_COMPONENTS = {
  ...elements,
  ...controls,
  ...patterns,
  ProgressChart, Icon, Avatar, InitialsAvatar, PageHeader, ModalFrame, ConfirmationModal, EmptyState,
  AppShell, AppErrorBoundary, AppStatusBanner, DataLoadError, MonthDatePicker, WorkoutScheduleFields,
  DatePickerField, ReadOnlyExerciseList, ActiveExerciseCard, PlanExerciseCard,
  ExerciseInstructionModal,
};
