import type { TaskOwner, TaskRule } from '../../config/labels.config';
import { DEFAULT_TIMEZONE, EVENT_TIME, LABELS, TASK_RULES } from '../../config/labels.config';

export interface LabelSettings {
  key: string;
  name: string;
  shortCode: string;
}

export interface TaskRuleSettings {
  id: string;
  title: string;
  daysBeforeRelease: number;
  owner: string;
  startHour: number;
  startMinute: number;
  enabled: boolean;
}

export interface AppSettings {
  labels: LabelSettings[];
  owners: string[];
  timezone: string;
  taskRules: TaskRuleSettings[];
  features: {
    dropbox: boolean;
    calendar: boolean;
    email: boolean;
    emailRecipient: string;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  labels: Object.values(LABELS).map((l) => ({
    key: l.key,
    name: l.name,
    shortCode: l.shortCode,
  })),
  owners: ['Gavin', 'Matty', 'James'],
  timezone: DEFAULT_TIMEZONE,
  taskRules: TASK_RULES.map((r) => ({
    id: r.id,
    title: r.title,
    daysBeforeRelease: r.daysBeforeRelease,
    owner: r.owner,
    startHour: r.startHour ?? EVENT_TIME.startHour,
    startMinute: r.startMinute ?? EVENT_TIME.startMinute,
    enabled: true,
  })),
  features: {
    dropbox: true,
    calendar: true,
    email: true,
    emailRecipient: '',
  },
};

export function findLabel(labels: LabelSettings[], key: string): LabelSettings {
  return (
    labels.find((l) => l.key === key) ?? {
      key,
      name: key,
      shortCode: key.split('-')[0]?.toUpperCase() ?? key,
    }
  );
}

export function settingsToTaskRules(rules: TaskRuleSettings[]): TaskRule[] {
  return rules
    .filter((r) => r.enabled)
    .map((r) => ({
      id: r.id,
      title: r.title,
      daysBeforeRelease: r.daysBeforeRelease,
      owner: r.owner as TaskOwner,
      startHour: r.startHour,
      startMinute: r.startMinute,
    }));
}
