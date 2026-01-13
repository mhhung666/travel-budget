'use client'

import { AppBar, Toolbar, Typography, Button, Box, IconButton, Avatar, Menu, MenuItem, Container } from '@mui/material'
import { AccountCircle, Logout, TravelExplore, Brightness4, Brightness7 } from '@mui/icons-material'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useThemeContext } from '@/app/context/ThemeContext'

interface NavbarProps {
  user?: {
    id: number
    username: string
    email: string
  } | null
  showUserMenu?: boolean
  title?: string
}

export default function Navbar({ user, showUserMenu = true, title = '旅行記帳' }: NavbarProps) {
  const router = useRouter()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const { mode, toggleTheme } = useThemeContext()

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
    } catch (error) {
      console.error('登出失敗:', error)
    }
  }

  const handleTrips = () => {
    router.push('/trips')
    handleClose()
  }

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar sx={{ px: { xs: 0 } }}>
          <TravelExplore sx={{ mr: 1, color: 'primary.main' }} />
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              color: 'text.primary',
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.25rem' }
            }}
          >
            {title}
          </Typography>

          {/* 主題切換按鈕 */}
          <IconButton
            onClick={toggleTheme}
            color="inherit"
            sx={{ mr: 1, color: 'text.primary' }}
            aria-label="切換主題"
          >
            {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
          </IconButton>

          {showUserMenu && user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  color: 'text.secondary',
                }}
              >
                {user.username}
              </Typography>
              <IconButton
                size="large"
                onClick={handleMenu}
                color="default"
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'primary.main',
                    fontSize: '0.875rem'
                  }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
              >
                <MenuItem onClick={handleTrips}>
                  <TravelExplore sx={{ mr: 1 }} fontSize="small" />
                  我的旅行
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  <Logout sx={{ mr: 1 }} fontSize="small" />
                  登出
                </MenuItem>
              </Menu>
            </Box>
          ) : (
            <Button
              variant="contained"
              onClick={() => router.push('/login')}
              sx={{
                textTransform: 'none',
                borderRadius: 2,
                px: { xs: 2, sm: 3 },
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }}
            >
              登入
            </Button>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  )
}
