'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { login, register } from '@/actions';
import ForgotPasswordModal from './ForgotPasswordModal';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LoginFormProps {
  hideBackToHome?: boolean;
  /** 登入/註冊成功後的站內導向目標（已在伺服端驗證過），預設 /trips */
  redirectTo?: string;
}

export default function LoginForm({ hideBackToHome = false, redirectTo }: LoginFormProps) {
  const router = useRouter();
  const t = useTranslations('auth');

  // We use key to force re-render tabs when checking isLogin,
  // but Shadcn Tabs controls state internally via value/onValueChange.
  // We'll sync isLogin with the tabs value.
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = isLogin
        ? await login({ username: formData.username, password: formData.password })
        : await register({
            username: formData.username,
            display_name: formData.display_name,
            email: formData.email,
            password: formData.password,
          });

      if (!result.success) {
        throw new Error(result.error || (isLogin ? t('login.error') : t('register.error')));
      }

      router.push(redirectTo ?? '/trips');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('login.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setIsLogin(value === 'login');
    setError('');
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-card/70 p-6 text-card-foreground shadow-xl shadow-black/[0.03] backdrop-blur-sm sm:p-10 dark:shadow-black/20">
        {/* 標題 */}
        <h1 className="mb-2 text-center text-2xl font-bold text-foreground">
          {isLogin ? t('login.title') : t('register.title')}
        </h1>
        <p className="text-center text-muted-foreground mb-8 text-sm sm:text-base">
          {isLogin ? t('login.subtitle') : t('register.subtitle')}
        </p>

        {/* Tabs */}
        <Tabs
          value={isLogin ? 'login' : 'register'}
          onValueChange={handleTabChange}
          className="w-full mb-8"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">{t('login.loginButton')}</TabsTrigger>
            <TabsTrigger value="register">{t('register.registerButton')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 錯誤訊息 */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t('login.username')}</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              minLength={3}
            />
          </div>

          {!isLogin && (
            <>
              <div className="space-y-2">
                <Label htmlFor="display_name">{t('register.displayName')}</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  required={!isLogin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('register.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
                <p className="text-[0.8rem] text-muted-foreground">{t('register.emailHelp')}</p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
            />
            {!isLogin && (
              <p className="text-[0.8rem] text-muted-foreground">{t('register.passwordHelp')}</p>
            )}
          </div>

          {isLogin && (
            <div className="text-right mb-6">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setForgotPasswordOpen(true)}
                className="text-muted-foreground hover:text-primary px-0 font-normal"
              >
                {t('forgotPassword.link')}
              </Button>
            </div>
          )}

          {/* Spacer if not login to keep layout consistent or just rely on space-y-4 */}
          <div className={isLogin ? '' : 'pt-2'}>
            <Button type="submit" className="w-full text-lg py-6 font-semibold" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              ) : isLogin ? (
                t('login.loginButton')
              ) : (
                t('register.registerButton')
              )}
            </Button>
          </div>
        </form>

        {/* 返回首頁 */}
        {!hideBackToHome && (
          <div className="mt-6 text-center">
            <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('login.backToHome')}
              </Link>
            </Button>
          </div>
        )}
      </div>

      <ForgotPasswordModal open={forgotPasswordOpen} onClose={() => setForgotPasswordOpen(false)} />
    </>
  );
}
