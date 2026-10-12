'use client';
import { ledgerErrorMessage } from '@/lib/ledgerErrorMessage';
import { QueryStatus } from '@/components/common/QueryStatus';

import { confirmWebWrite } from '@/lib/confirmedWebWrites';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Loader2 } from 'lucide-react';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { addFriendsToTrip, getLedgerCapabilities } from '@/actions';
import { useFriends } from '@/hooks/queries';
import type { Trip } from '@/types';

import { ResponsiveFormSheet } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { trackProductEvent } from '@/lib/productEvents';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { COMMON_CURRENCY_CODES, getCurrencyLabel } from '@/constants/currencies';
import { CurrencyPicker, CurrencySearchPanel } from './CurrencyPicker';

interface CreateTripDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (trip: Pick<Trip, 'id'>) => void;
}

const FORM_ID = 'create-trip-form';
const CAPABILITIES_KEY = ['ledgerCapabilities'] as const;
type Capabilities = {
  supportedBaseCurrencies: string[];
  nonTwdCreationEnabled: boolean;
};
function allowedCurrencies(data: Capabilities | undefined) {
  return [...new Set(data?.supportedBaseCurrencies ?? [])].filter(
    (code) => data?.nonTwdCreationEnabled || code === 'TWD'
  );
}
function capabilityCanCreate(
  state: { data?: Capabilities; status: string; fetchStatus: string } | undefined,
  value: string
) {
  return (
    state?.status === 'success' &&
    state.fetchStatus === 'idle' &&
    allowedCurrencies(state.data).includes(value)
  );
}

export default function CreateTripDialog({ open, onClose, onSuccess }: CreateTripDialogProps) {
  const t = useTranslations('trips');
  const tLedger = useTranslations('ledger');
  const client = useQueryClient();
  const online = useOnlineStatus();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const locale = useLocale();
  const tCurrency = useTranslations('currencyPicker');
  const tCreation = useTranslations('currencyPicker.creation');
  const inFlight = useRef(false);
  const currencyField = useRef<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wasPickerOpen = useRef(false);
  useLayoutEffect(() => {
    if (wasPickerOpen.current && !pickerOpen && open && !isDesktop)
      currencyField.current?.focus({ preventScroll: true });
    wasPickerOpen.current = pickerOpen;
  }, [pickerOpen, open, isDesktop]);
  const [baseCurrency, setBaseCurrency] = useState('TWD');
  const capabilities = useQuery({
    queryKey: CAPABILITIES_KEY,
    enabled: open && online,
    staleTime: 0,
    queryFn: async () => {
      const r = await getLedgerCapabilities();
      if (!r.success) throw new Error(r.error);
      return r.data;
    },
  });
  const tCommon = useTranslations('common');
  const codes = useMemo(() => allowedCurrencies(capabilities.data), [capabilities.data]);
  const selectedLabel = COMMON_CURRENCY_CODES.includes(baseCurrency)
    ? tCurrency(`names.${baseCurrency}`)
    : getCurrencyLabel(baseCurrency, locale);
  const selectedText =
    selectedLabel === baseCurrency ? baseCurrency : `${baseCurrency} · ${selectedLabel}`;
  const invalidCurrency = !!capabilities.data && !codes.includes(baseCurrency);
  const readOnlyCurrency =
    !pickerOpen && codes.length === 1 && codes[0] === 'TWD' && baseCurrency === 'TWD';
  const canChoose = !!capabilities.data && codes.length > 0;
  const capabilityReady = online && capabilities.isSuccess && capabilities.fetchStatus === 'idle';
  const canSubmit =
    open && online && !pickerOpen && capabilityCanCreate(capabilities, baseCurrency);
  const closePicker = () => {
    setPickerOpen(false);
  };
  const changeCurrency = (code: string) => {
    if (!inFlight.current && codes.includes(code)) setBaseCurrency(code);
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [destinationLocation, setDestinationLocation] = useState<LocationOption | null>(null);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draftRetained, setDraftRetained] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 建立當下即可挑好友一起加入（ROADMAP #12 Phase 3）。好友資料共用 useFriends 快取。
  // 進階欄位展開前不先請求好友，讓第一屏只專注在唯一必填的旅行名稱。
  const friendsQuery = useFriends(open && detailsOpen);
  const { data: friendsData } = friendsQuery;
  const friends = friendsData?.friends ?? [];

  const toggleFriend = (id: string) => {
    if (inFlight.current) return;
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setPickerOpen(false);
    setBaseCurrency('TWD');
    setDraftRetained(false);
    setError('');
    setFormData({ name: '', description: '', start_date: '', end_date: '' });
    setDestinationLocation(null);
    setSelectedFriends(new Set());
    setDetailsOpen(false);
  };
  const handleClose = () => {
    if (inFlight.current) return;
    if (pickerOpen) {
      closePicker();
      return;
    }
    setDraftRetained(
      Boolean(
        formData.name ||
        formData.description ||
        formData.start_date ||
        formData.end_date ||
        destinationLocation ||
        selectedFriends.size ||
        baseCurrency !== 'TWD'
      )
    );
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      inFlight.current ||
      !canSubmit ||
      !navigator.onLine ||
      !capabilityCanCreate(client.getQueryState<Capabilities>(CAPABILITIES_KEY), baseCurrency)
    )
      return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);

    try {
      const result = (await confirmWebWrite(client, {
        operation: 'trip.create',
        body: {
          client_request_id: crypto.randomUUID(),
          base_currency: baseCurrency,
          ...formData,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
        },
        destination: destinationLocation || null,
      })) as Pick<Trip, 'id'>;
      const createdTrip = result;
      trackProductEvent('activation_step', { step: 'trip_created' });

      // 建立成功後，把勾選的好友直接加入新旅程（best-effort：即使失敗旅程仍已建立，
      // 使用者可事後在成員頁補加，故不因此擋下流程）。
      if (selectedFriends.size > 0) {
        const addResult = await addFriendsToTrip(createdTrip.id, {
          friend_ids: [...selectedFriends],
        });
        if (addResult.success) {
          trackProductEvent('activation_step', { step: 'companion_added' });
        }
      }

      resetForm();
      onClose();
      onSuccess(createdTrip);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(tCommon('error.unknown'));
      }
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  const currencyTrigger = (
    <Button
      id="trip-base"
      ref={(node) => {
        currencyField.current = node;
      }}
      type="button"
      variant="outline"
      aria-labelledby="trip-base-label trip-base-value"
      aria-describedby={`trip-base-help${invalidCurrency ? ' trip-base-error' : ''} trip-base-status`}
      aria-invalid={invalidCurrency || undefined}
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
      disabled={submitting || !canChoose}
      onClick={
        !isDesktop
          ? () => {
              if (!inFlight.current && canChoose) setPickerOpen(true);
            }
          : undefined
      }
      className="h-auto min-h-[52px] w-full justify-between rounded-xl bg-background px-3 py-3 text-left text-base font-normal whitespace-normal"
    >
      <span id="trip-base-value" className="min-w-0 break-words">
        {selectedText}
      </span>
      <ChevronDown aria-hidden="true" className="ml-3 size-5 shrink-0" />
    </Button>
  );

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(val) => !val && handleClose()}
      title={t('create.title')}
      description={t('create.formDescription')}
      onOpenAutoFocus={(event) => {
        if (pickerOpen) event.preventDefault();
      }}
      onCloseAutoFocus={(event) => {
        if (pickerOpen) event.preventDefault();
      }}
      subview={
        !isDesktop && pickerOpen
          ? {
              title: tCreation('title'),
              content: (
                <CurrencySearchPanel
                  codes={codes}
                  value={baseCurrency}
                  title={tCreation('title')}
                  disabled={submitting}
                  autoFocusSearch={false}
                  enterSelection="navigated"
                  layout="sheet"
                  onCancel={closePicker}
                  onSelect={(code) => {
                    changeCurrency(code);
                    closePicker();
                  }}
                />
              ),
            }
          : undefined
      }
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="max-md:hidden"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={submitting || !canSubmit}
            className="max-md:h-12 max-md:w-full max-md:text-base"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? tCreation('creating') : tCommon('create')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <fieldset
          disabled={submitting || pickerOpen}
          inert={pickerOpen || undefined}
          className="min-w-0 space-y-4"
        >
          {draftRetained && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{t('create.draftRetained')}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (!inFlight.current) resetForm();
                  }}
                  disabled={submitting}
                >
                  {t('create.clearDraft')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
              <AlertDescription>{ledgerErrorMessage(error, tLedger)}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t('create.name')}</Label>
            <Input
              id="name"
              maxLength={100}
              value={formData.name}
              placeholder={t('create.namePlaceholder')}
              onChange={(e) => {
                if (!inFlight.current) setFormData({ ...formData, name: e.target.value });
              }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trip-base" id="trip-base-label">
              {tLedger('baseCurrency')}
            </Label>
            {readOnlyCurrency ? (
              <div
                id="trip-base"
                ref={(node) => {
                  currencyField.current = node;
                }}
                role="group"
                tabIndex={0}
                aria-labelledby="trip-base-label trip-base-value"
                aria-describedby="trip-base-help trip-base-status"
                className="flex min-h-[52px] items-center rounded-xl border border-input bg-background px-3 py-3 text-base"
              >
                <span id="trip-base-value" className="break-words">
                  {selectedText}
                </span>
              </div>
            ) : isDesktop ? (
              <CurrencyPicker
                open={pickerOpen}
                onOpenChange={(next) => {
                  if (next) {
                    if (!inFlight.current && canChoose) setPickerOpen(true);
                  } else closePicker();
                }}
                codes={codes}
                value={baseCurrency}
                onSelect={changeCurrency}
                title={tCreation('title')}
                disabled={submitting}
                trigger={currencyTrigger}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  if (!wasPickerOpen.current) currencyField.current?.focus({ preventScroll: true });
                }}
              />
            ) : (
              currencyTrigger
            )}
            <p id="trip-base-help" className="text-sm text-foreground">
              {tCreation('description')}
            </p>
            <div
              id="trip-base-status"
              role="status"
              className="space-y-1 text-sm text-muted-foreground"
            >
              {!online ? (
                <p>{tCreation('offline')}</p>
              ) : capabilities.isError || (capabilityReady && codes.length === 0) ? (
                <p>{tCreation('unavailable')}</p>
              ) : !capabilityReady ? (
                <p>{tCreation('loading')}</p>
              ) : readOnlyCurrency ? (
                <p>{tCreation('onlyTwd', { currency: selectedText })}</p>
              ) : null}
              {(capabilities.isError || (capabilityReady && codes.length === 0)) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 px-0 text-sm"
                  disabled={!online || submitting || capabilities.isFetching}
                  onClick={() => void capabilities.refetch()}
                >
                  {tCommon('retry')}
                </Button>
              )}
            </div>
            {invalidCurrency && (
              <p id="trip-base-error" role="alert" className="text-sm text-destructive">
                {tCreation('notAllowed', { currency: baseCurrency })}
              </p>
            )}
          </div>
          <LocationAutocomplete
            value={destinationLocation}
            onChange={(value) => {
              if (!inFlight.current) setDestinationLocation(value);
            }}
            disabled={submitting || pickerOpen}
            label={t('create.destination')}
            placeholder={t('create.destinationPlaceholder')}
            helperText={t('create.destinationHelp')}
          />

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between px-2 text-muted-foreground"
              >
                <span>
                  {friends.length > 0
                    ? t('create.moreDetailsWithFriends')
                    : t('create.moreDetails')}
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="description">{t('create.description')}</Label>
                <Textarea
                  id="description"
                  maxLength={2000}
                  value={formData.description}
                  placeholder={t('create.descriptionPlaceholder')}
                  onChange={(e) => {
                    if (!inFlight.current)
                      setFormData({ ...formData, description: e.target.value });
                  }}
                  rows={2}
                />
              </div>

              {/* 旅遊時間區間 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="start_date">{t('create.startDate')}</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => {
                      if (!inFlight.current)
                        setFormData({ ...formData, start_date: e.target.value });
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="end_date">{t('create.endDate')}</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => {
                      if (!inFlight.current) setFormData({ ...formData, end_date: e.target.value });
                    }}
                    min={formData.start_date}
                  />
                </div>
              </div>

              {/* 從好友挑選一起加入（有好友時才顯示） */}
              {open && detailsOpen && <QueryStatus query={friendsQuery} />}
              {friends.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('create.inviteFriends')}</Label>
                  <ScrollArea className="max-h-40 rounded-md border">
                    <div className="space-y-1 p-2">
                      {friends.map((f) => (
                        <label
                          key={f.user.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={selectedFriends.has(f.user.id)}
                            onCheckedChange={() => toggleFriend(f.user.id)}
                          />
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={f.user.avatar_url ?? ''} alt={f.user.display_name} />
                            <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                              {f.user.display_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {f.user.display_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </fieldset>
      </form>
    </ResponsiveFormSheet>
  );
}
