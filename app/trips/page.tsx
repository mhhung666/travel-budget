'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
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
  Chip,
  Avatar,
} from '@mui/material';
import {
  Add,
  GroupAdd,
  Logout,
  People,
  CalendarToday,
} from '@mui/icons-material';

interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
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
        body: JSON.stringify({ trip_id: parseInt(joinTripId) }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setShowJoinModal(false);
      setJoinTripId('');
      await loadTrips();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
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
      <AppBar position="static" elevation={1} sx={{ bgcolor: 'white', color: 'text.primary' }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 700 }}>
            我的旅行
          </Typography>
          <Chip
            avatar={<Avatar sx={{ bgcolor: 'primary.main' }}>{user?.display_name?.charAt(0)}</Avatar>}
            label={`歡迎, ${user?.display_name}`}
            sx={{ mr: 2 }}
          />
          <Button
            onClick={handleLogout}
            variant="outlined"
            startIcon={<Logout />}
            sx={{ textTransform: 'none' }}
          >
            登出
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Card elevation={2}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h5" fontWeight={600}>
                旅行列表
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
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
                    <CardActionArea onClick={() => router.push(`/trips/${trip.id}`)}>
                      <CardContent>
                        <Typography variant="h6" fontWeight={600} gutterBottom>
                          {trip.name}
                        </Typography>
                        {trip.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {trip.description}
                          </Typography>
                        )}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              type="number"
              label="旅行 ID"
              value={joinTripId}
              onChange={(e) => setJoinTripId(e.target.value)}
              required
              placeholder="請輸入旅行 ID"
              helperText="向其他成員詢問旅行 ID 以加入"
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
    </Box>
  );
}
