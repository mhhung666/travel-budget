'use client';

import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  ItineraryImportPreview,
  ItineraryImportPreviewActivity,
  ItineraryImportPreviewIssue,
} from '@/lib/ai/itineraryImportPreview';
import { ITINERARY_IMPORT_ACTIVITY_TYPES } from '@/lib/ai/itineraryImportSchema';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type ImportPreviewProps = {
  preview: ItineraryImportPreview;
  issues: ItineraryImportPreviewIssue[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  onChange: (preview: ItineraryImportPreview) => void;
};

function hasWarning(
  preview: ItineraryImportPreview,
  code: ItineraryImportPreview['warnings'][number]['code'],
  dayIndex: number,
  activityIndex?: number
): boolean {
  return preview.warnings.some(
    (warning) =>
      warning.code === code &&
      warning.dayIndex === dayIndex &&
      (activityIndex === undefined || warning.activityIndex === activityIndex)
  );
}

export default function ImportPreview({
  preview,
  issues,
  tripStartDate,
  tripEndDate,
  onChange,
}: ImportPreviewProps) {
  const t = useTranslations('itinerary.aiImport');
  const tActivities = useTranslations('itinerary.activities');
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(() => new Set());

  const patchDay = (dayIndex: number, fields: Partial<ItineraryImportPreview['days'][number]>) =>
    onChange({
      ...preview,
      days: preview.days.map((day, index) => (index === dayIndex ? { ...day, ...fields } : day)),
    });

  const patchActivity = (
    dayIndex: number,
    activityIndex: number,
    fields: Partial<ItineraryImportPreviewActivity>
  ) => {
    const day = preview.days[dayIndex];
    patchDay(dayIndex, {
      activities: day.activities.map((activity, index) =>
        index === activityIndex ? { ...activity, ...fields } : activity
      ),
    });
  };

  const dayIssues = (dayIndex: number) =>
    issues.filter((issue) => issue.dayIndex === dayIndex && issue.activityIndex === undefined);
  const activityIssues = (dayIndex: number, activityIndex: number) =>
    issues.filter((issue) => issue.dayIndex === dayIndex && issue.activityIndex === activityIndex);

  return (
    <div className="space-y-4" data-testid="ai-import-preview">
      {preview.sourceSummary && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="mb-1 font-medium">{t('sourceSummary')}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{preview.sourceSummary}</p>
        </div>
      )}

      {preview.warnings.some((warning) => warning.code === 'UNRECOGNIZED_CONTENT') && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('warnings.UNRECOGNIZED_CONTENT')}</AlertDescription>
        </Alert>
      )}

      {issues.some((issue) => issue.code === 'NO_SELECTION') && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('issues.NO_SELECTION')}</AlertDescription>
        </Alert>
      )}

      {preview.days.map((day, dayIndex) => {
        const currentDayIssues = dayIssues(dayIndex);
        const append =
          day.date === day.sourceDate && hasWarning(preview, 'EXISTING_DAY_APPEND', dayIndex);
        const outside =
          !!day.date &&
          ((!!tripStartDate && day.date < tripStartDate) ||
            (!!tripEndDate && day.date > tripEndDate));

        return (
          <section
            key={day.id}
            className={`space-y-4 rounded-xl border p-4 ${day.included ? 'bg-card' : 'bg-muted/30 opacity-75'}`}
            aria-labelledby={`${day.id}-heading`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                id={`${day.id}-included`}
                checked={day.included}
                onCheckedChange={(checked) => patchDay(dayIndex, { included: checked === true })}
              />
              <Label id={`${day.id}-heading`} htmlFor={`${day.id}-included`} className="mr-auto">
                {t('dayHeading', { number: dayIndex + 1 })}
              </Label>
              {outside ? (
                <Badge variant="destructive">{t('status.outside')}</Badge>
              ) : append ? (
                <Badge variant="secondary">{t('status.append')}</Badge>
              ) : (
                <Badge variant="outline">{t('status.new')}</Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={day.included ? t('excludeDay') : t('includeDay')}
                title={day.included ? t('excludeDay') : t('includeDay')}
                onClick={() => patchDay(dayIndex, { included: !day.included })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {day.included && (
              <>
                {currentDayIssues.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {currentDayIssues.map((issue) => t(`issues.${issue.code}`)).join(' · ')}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${day.id}-date`}>{t('date')}</Label>
                    <Input
                      id={`${day.id}-date`}
                      type="date"
                      value={day.date}
                      aria-invalid={currentDayIssues.some((issue) =>
                        ['MISSING_DATE', 'INVALID_DATE', 'DATE_OUTSIDE_TRIP'].includes(issue.code)
                      )}
                      onChange={(event) => patchDay(dayIndex, { date: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${day.id}-title`}>{t('dayTitle')}</Label>
                    <Input
                      id={`${day.id}-title`}
                      value={day.title}
                      aria-invalid={currentDayIssues.some((issue) =>
                        ['MISSING_DAY_TITLE', 'DAY_TITLE_TOO_LONG'].includes(issue.code)
                      )}
                      onChange={(event) => patchDay(dayIndex, { title: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${day.id}-content`}>{t('dayContent')}</Label>
                  <Textarea
                    id={`${day.id}-content`}
                    value={day.content}
                    onChange={(event) => patchDay(dayIndex, { content: event.target.value })}
                  />
                </div>

                <div className="space-y-3">
                  <p className="font-medium">{t('activities')}</p>
                  {day.activities.map((activity, activityIndex) => {
                    const currentActivityIssues = activityIssues(dayIndex, activityIndex);
                    const duplicate = hasWarning(
                      preview,
                      'POSSIBLE_DUPLICATE',
                      dayIndex,
                      activityIndex
                    );
                    const revealed = revealedCodes.has(activity.id);
                    return (
                      <div
                        key={activity.id}
                        className={`space-y-3 rounded-lg border p-3 ${activity.included ? 'bg-background' : 'bg-muted/30 opacity-75'}`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`${activity.id}-included`}
                            checked={activity.included}
                            onCheckedChange={(checked) =>
                              patchActivity(dayIndex, activityIndex, { included: checked === true })
                            }
                          />
                          <Label htmlFor={`${activity.id}-included`} className="mr-auto">
                            {t('activityHeading', { number: activityIndex + 1 })}
                          </Label>
                          {duplicate && <Badge variant="secondary">{t('status.duplicate')}</Badge>}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={
                              activity.included ? t('excludeActivity') : t('includeActivity')
                            }
                            title={activity.included ? t('excludeActivity') : t('includeActivity')}
                            onClick={() =>
                              patchActivity(dayIndex, activityIndex, {
                                included: !activity.included,
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {activity.included && (
                          <>
                            {currentActivityIssues.length > 0 && (
                              <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                  {currentActivityIssues
                                    .map((issue) => t(`issues.${issue.code}`))
                                    .join(' · ')}
                                </AlertDescription>
                              </Alert>
                            )}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_7rem_1fr]">
                              <Input
                                type="time"
                                aria-label={tActivities('time')}
                                value={activity.time}
                                onChange={(event) =>
                                  patchActivity(dayIndex, activityIndex, {
                                    time: event.target.value,
                                  })
                                }
                              />
                              <Input
                                type="time"
                                aria-label={tActivities('endTime')}
                                value={activity.endTime}
                                onChange={(event) =>
                                  patchActivity(dayIndex, activityIndex, {
                                    endTime: event.target.value,
                                  })
                                }
                              />
                              <Input
                                className="col-span-2 sm:col-span-1"
                                aria-label={t('activityTitle')}
                                value={activity.title}
                                onChange={(event) =>
                                  patchActivity(dayIndex, activityIndex, {
                                    title: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Select
                                value={activity.type}
                                onValueChange={(type) =>
                                  patchActivity(dayIndex, activityIndex, {
                                    type: type as ItineraryImportPreviewActivity['type'],
                                  })
                                }
                              >
                                <SelectTrigger aria-label={tActivities('typeLabel')}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ITINERARY_IMPORT_ACTIVITY_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {tActivities(`types.${type}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                aria-label={t('locationName')}
                                value={activity.locationName}
                                onChange={(event) =>
                                  patchActivity(dayIndex, activityIndex, {
                                    locationName: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <Input
                              aria-label={tActivities('note')}
                              value={activity.note}
                              onChange={(event) =>
                                patchActivity(dayIndex, activityIndex, {
                                  note: event.target.value,
                                })
                              }
                            />
                            <div className="flex gap-2">
                              <Input
                                type={revealed ? 'text' : 'password'}
                                aria-label={tActivities('confirmationCode')}
                                autoComplete="off"
                                value={activity.confirmationCode}
                                onChange={(event) =>
                                  patchActivity(dayIndex, activityIndex, {
                                    confirmationCode: event.target.value,
                                  })
                                }
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={revealed ? t('hideCode') : t('showCode')}
                                aria-pressed={revealed}
                                onClick={() =>
                                  setRevealedCodes((current) => {
                                    const next = new Set(current);
                                    if (revealed) next.delete(activity.id);
                                    else next.add(activity.id);
                                    return next;
                                  })
                                }
                              >
                                {revealed ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
