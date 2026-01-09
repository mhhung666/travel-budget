'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  Add,
  GroupAdd,
  People,
  CalendarToday,
  ContentCopy,
} from '@mui/icons-material';
import Navbar from '@/components/Navbar';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  hash_code: string;
}

export default function TripsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [joinTripId, setJoinTripId] = useState('');
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setUser(data.user);
      await loadTrips();
    } catch (error) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadTrips = async () => {
    try {
      const response = await fetch('/api/trips');
      if (response.ok) {
        const data = await response.json();
        setTrips(data.trips);
      }
    } catch (error) {
      console.error('Load trips error:', error);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoinTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: joinTripId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowJoinModal(false);
      setJoinTripId('');
      setSnackbar({ open: true, message: '成功加入旅行！', severity: 'success' });
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyHashCode = async (hashCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hashCode);
      setSnackbar({ open: true, message: 'ID 已複製！', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: '複製失敗', severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar
        user={user ? {
          id: user.id,
          username: user.display_name,
          email: user.email
        } : null}
        showUserMenu={true}
        title="我的旅行"
      />

      <Container maxWidth="lg" sx={{ pt: { xs: 10, sm: 12 }, pb: 4 }}>
        <Card elevation={2}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, mb: 3 }}>
              <Typography variant="h5" fontWeight={600}>
                旅行列表
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                <Button
                  onClick={() => setShowJoinModal(true)}
                  variant="outlined"
                  startIcon={<GroupAdd />}
                  sx={{ textTransform: 'none' }}
                >
                  加入旅行
                </Button>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  variant="contained"
                  startIcon={<Add />}
                  sx={{ textTransform: 'none' }}
                >
                  建立新旅行
                </Button>
              </Box>
            </Box>

            {trips.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  目前還沒有旅行記錄
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  點擊「建立新旅行」開始規劃你的旅程!
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
                {trips.map((trip) => (
                  <Card
                    key={trip.id}
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: 4,
                        transform: 'translateY(-4px)',
                      },
                    }}
                  >
                    <CardActionArea onClick={() => router.push(`/trips/${trip.hash_code}`)}>
                      <CardContent>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          {trip.name}
                        </Typography>
                        {trip.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {trip.description}
                          </Typography>
                        )}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                          <Chip
                            icon={<People />}
                            label={`${trip.member_count} 位成員`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            icon={<CalendarToday />}
                            label={new Date(trip.created_at).toLocaleDateString('zh-TW')}
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                        <Chip
                          label={`ID: ${trip.hash_code}`}
                          size="small"
                          onClick={(e) => copyHashCode(trip.hash_code, e)}
                          icon={<ContentCopy fontSize="small" />}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'primary.50' }
                          }}
                        />
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Container>

      {/* 建立旅行 Dialog */}
      <Dialog
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setError('');
          setFormData({ name: '', description: '' });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>建立新旅行</DialogTitle>
        <form onSubmit={handleCreateTrip}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              fullWidth
              label="旅行名稱"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="描述 (可選)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={3}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setShowCreateModal(false);
                setError('');
                setFormData({ name: '', description: '' });
              }}
            >
              取消
            </Button>
            <Button type="submit" variant="contained">
              建立
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* 加入旅行 Dialog */}
      <Dialog
        open={showJoinModal}
        onClose={() => {
          setShowJoinModal(false);
          setError('');
          setJoinTripId('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>加入旅行</DialogTitle>
        <form onSubmit={handleJoinTrip}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              fullWidth
              label="旅行 ID"
              value={joinTripId}
              onChange={(e) => setJoinTripId(e.target.value)}
              required
              placeholder="輸入 6-8 位旅行代碼 (例如: a7x9k2)"
              helperText="向旅行創建者索取旅行代碼"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                setShowJoinModal(false);
                setError('');
                setJoinTripId('');
              }}
            >
              取消
            </Button>
            <Button type="submit" variant="contained">
              加入
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Snackbar 通知 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
