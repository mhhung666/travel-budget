'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadFile } from '@/lib/download';
import { cn } from '@/lib/utils';
import type { ExportFile, ExportFormat } from '@/lib/exporters';

interface ExportMenuProps {
  /** 依使用者選的格式產生檔案內容（呼叫端注入在地化標籤） */
  build: (format: ExportFormat) => ExportFile;
  /** 檔名前綴（不含副檔名），例如 `${tripName}-itinerary` */
  fileBaseName: string;
  /** 提供的格式，預設三種皆有 */
  formats?: ExportFormat[];
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** 套用在文字標籤上的 class（例如手機版隱藏文字：`hidden sm:inline`） */
  labelClassName?: string;
}

const DEFAULT_FORMATS: ExportFormat[] = ['markdown', 'csv', 'json'];

export default function ExportMenu({
  build,
  fileBaseName,
  formats = DEFAULT_FORMATS,
  disabled = false,
  variant = 'outline',
  size = 'sm',
  align = 'end',
  className,
  labelClassName,
}: ExportMenuProps) {
  const t = useTranslations('export');

  const handleExport = (format: ExportFormat) => {
    downloadFile(fileBaseName, build(format));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={disabled}
          className={cn('gap-2', className)}
        >
          <Download className="h-4 w-4" />
          <span className={labelClassName}>{t('label')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {formats.map((format) => (
          <DropdownMenuItem key={format} onClick={() => handleExport(format)}>
            {t(format)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
