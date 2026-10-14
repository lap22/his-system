import Add from '@mui/icons-material/Add'
import Delete from '@mui/icons-material/Delete'
import Edit from '@mui/icons-material/Edit'
import PersonSearch from '@mui/icons-material/PersonSearch'
import Star from '@mui/icons-material/Star'
import Visibility from '@mui/icons-material/Visibility'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import {
  useCreatePatientProfile,
  useDeletePatientProfile,
  usePatientProfile,
  usePatientProfiles,
  useUpdatePatientProfile,
} from '../hooks/usePatientProfiles'
import { profileDeletionErrorMessage, profileErrorMessage } from '../services/patientProfilesApi'
import {
  bloodTypeOptions,
  genderOptions,
  patientProfileFormSchema,
  relationshipOptions,
  toPatientProfileRequest,
} from '../types/patientProfile'
import type { PatientProfile, PatientProfileFormValues } from '../types/patientProfile'

const emptyForm: PatientProfileFormValues = {
  fullName: '',
  dateOfBirth: '',
  gender: 'Male',
  phone: '',
  address: '',
  bloodType: '',
  relationship: 'Self',
  isDefault: false,
}

function toFormValues(profile: PatientProfile | null): PatientProfileFormValues {
  if (!profile) return emptyForm
  return {
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    bloodType: profile.bloodType ?? '',
    relationship: profile.relationship,
    isDefault: profile.isDefault,
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box>
      <Typography color="text.secondary" variant="caption">{label}</Typography>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{value || 'Not provided'}</Typography>
    </Box>
  )
}

type ProfileDialogProps = {
  mode: 'create' | 'edit'
  open: boolean
  profile: PatientProfile | null
  onClose: () => void
}

function ProfileFormDialog({ mode, open, profile, onClose }: ProfileDialogProps) {
  const createProfile = useCreatePatientProfile()
  const updateProfile = useUpdatePatientProfile()
  const mutation = mode === 'create' ? createProfile : updateProfile
  const form = useForm<PatientProfileFormValues>({
    resolver: zodResolver(patientProfileFormSchema),
    defaultValues: toFormValues(profile),
  })

  useEffect(() => {
    if (open) form.reset(toFormValues(profile))
  }, [form, open, profile])

  const submit = form.handleSubmit(async (values) => {
    const request = toPatientProfileRequest(patientProfileFormSchema.parse(values))
    if (mode === 'create') await createProfile.mutateAsync(request)
    else if (profile) await updateProfile.mutateAsync({ id: profile.id, request })
    onClose()
  })

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={mutation.isPending ? undefined : onClose}>
      <DialogTitle>{mode === 'create' ? 'Add Patient Profile' : 'Edit Patient Profile'}</DialogTitle>
      <Box component="form" noValidate onSubmit={(event) => { void submit(event) }}>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{profileErrorMessage(mutation.error)}</Alert> : null}
          <Controller
            control={form.control}
            name="fullName"
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                autoFocus
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                label="Full name"
                required
                slotProps={{ htmlInput: { maxLength: 150 } }}
              />
            )}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Controller
              control={form.control}
              name="dateOfBirth"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                  label="Birth date"
                  required
                  slotProps={{
                    htmlInput: { max: new Date().toISOString().slice(0, 10) },
                    inputLabel: { shrink: true },
                  }}
                  type="date"
                />
              )}
            />
            <Controller
              control={form.control}
              name="gender"
              render={({ field, fieldState }) => (
                <FormControl error={Boolean(fieldState.error)} required>
                  <InputLabel id="profile-gender-label">Gender</InputLabel>
                  <Select {...field} label="Gender" labelId="profile-gender-label">
                    {genderOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                  </Select>
                  <FormHelperText>{fieldState.error?.message}</FormHelperText>
                </FormControl>
              )}
            />
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Controller
              control={form.control}
              name="relationship"
              render={({ field, fieldState }) => (
                <FormControl error={Boolean(fieldState.error)} required>
                  <InputLabel id="profile-relationship-label">Relationship</InputLabel>
                  <Select {...field} label="Relationship" labelId="profile-relationship-label">
                    {relationshipOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                  </Select>
                  <FormHelperText>{fieldState.error?.message}</FormHelperText>
                </FormControl>
              )}
            />
            <Controller
              control={form.control}
              name="bloodType"
              render={({ field, fieldState }) => (
                <FormControl error={Boolean(fieldState.error)}>
                  <InputLabel id="profile-blood-type-label">Blood type</InputLabel>
                  <Select
                    {...field}
                    label="Blood type"
                    labelId="profile-blood-type-label"
                    onChange={(event: SelectChangeEvent) => field.onChange(event.target.value)}
                    value={field.value ?? ''}
                  >
                    <MenuItem value="">Not provided</MenuItem>
                    {bloodTypeOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                  </Select>
                  <FormHelperText>{fieldState.error?.message}</FormHelperText>
                </FormControl>
              )}
            />
          </Box>
          <Controller
            control={form.control}
            name="phone"
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                label="Phone"
                slotProps={{ htmlInput: { maxLength: 20 } }}
                value={field.value ?? ''}
              />
            )}
          />
          <Controller
            control={form.control}
            name="address"
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                label="Address"
                minRows={3}
                multiline
                slotProps={{ htmlInput: { maxLength: 500 } }}
                value={field.value ?? ''}
              />
            )}
          />
          <Controller
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox checked={field.value} onChange={(_, checked) => field.onChange(checked)} />}
                label="Set as default profile"
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

function DetailsDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = usePatientProfile(id)
  const profile = query.data

  return (
    <Dialog fullWidth maxWidth="sm" open={Boolean(id)} onClose={onClose}>
      <DialogTitle>Profile Details</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {query.isLoading ? <CircularProgress aria-label="Loading profile details" /> : null}
        {query.isError ? <Alert severity="error">{profileErrorMessage(query.error)}</Alert> : null}
        {profile ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="h5">{profile.fullName}</Typography>
              {profile.isDefault ? <Chip color="primary" icon={<Star />} label="Default" size="small" /> : null}
            </Stack>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <InfoLine label="Birth date" value={formatDate(profile.dateOfBirth)} />
              <InfoLine label="Gender" value={profile.gender} />
              <InfoLine label="Relationship" value={profile.relationship} />
              <InfoLine label="Phone" value={profile.phone} />
              <InfoLine label="Blood type" value={profile.bloodType} />
              <InfoLine label="Address" value={profile.address} />
              <InfoLine label="Created" value={formatDate(profile.createdAt)} />
              <InfoLine label="Last updated" value={profile.updatedAt ? formatDate(profile.updatedAt) : null} />
            </Box>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

function DeleteDialog({ profile, onClose }: { profile: PatientProfile | null; onClose: () => void }) {
  const deleteProfile = useDeletePatientProfile()
  const confirm = () => {
    if (!profile) return
    deleteProfile.mutate(profile.id, { onSuccess: onClose })
  }

  return (
    <Dialog fullWidth maxWidth="xs" open={Boolean(profile)} onClose={deleteProfile.isPending ? undefined : onClose}>
      <DialogTitle>Delete Profile</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {deleteProfile.isError ? <Alert severity="error">{profileDeletionErrorMessage(deleteProfile.error)}</Alert> : null}
        <Typography>
          Delete {profile?.fullName}? This removes the patient profile from your account.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleteProfile.isPending}>Cancel</Button>
        <Button color="error" onClick={confirm} disabled={deleteProfile.isPending} variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 7 }}>
        <PersonSearch color="primary" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h5">No patient profiles yet</Typography>
        <Typography color="text.secondary" sx={{ mx: 'auto', maxWidth: 520, mt: 1 }}>
          Add a profile for yourself or a family member before using patient services.
        </Typography>
        <Button startIcon={<Add />} sx={{ mt: 3 }} variant="contained" onClick={onAdd}>
          Add Profile
        </Button>
      </CardContent>
    </Card>
  )
}

export function PatientProfilesPage() {
  const profiles = usePatientProfiles()
  const updateProfile = useUpdatePatientProfile()
  const [formState, setFormState] = useState<{ mode: 'create' | 'edit'; profile: PatientProfile | null } | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PatientProfile | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const sortedProfiles = useMemo(() => profiles.data ?? [], [profiles.data])

  const setDefault = async (profile: PatientProfile) => {
    setActionError(null)
    try {
      await updateProfile.mutateAsync({
        id: profile.id,
        request: {
          fullName: profile.fullName,
          dateOfBirth: profile.dateOfBirth,
          gender: profile.gender,
          phone: profile.phone ?? null,
          address: profile.address ?? null,
          bloodType: profile.bloodType ?? null,
          relationship: profile.relationship,
          isDefault: true,
        },
      })
    } catch (error) {
      setActionError(profileErrorMessage(error))
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box sx={{ alignItems: { xs: 'stretch', sm: 'center' }, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography component="h1" variant="h4">Patient Profiles</Typography>
          <Typography color="text.secondary">Manage the profiles connected to your patient account.</Typography>
        </Box>
        <Button startIcon={<Add />} variant="contained" onClick={() => setFormState({ mode: 'create', profile: null })}>
          Add Profile
        </Button>
      </Box>

      {profiles.isLoading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <CircularProgress aria-label="Loading patient profiles" />
        </Box>
      ) : null}

      {profiles.isError ? (
        <Alert action={<Button color="inherit" onClick={() => { void profiles.refetch() }}>Retry</Button>} severity="error">
          {profileErrorMessage(profiles.error)}
        </Alert>
      ) : null}

      {actionError ? <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert> : null}

      {!profiles.isLoading && !profiles.isError && sortedProfiles.length === 0 ? (
        <EmptyState onAdd={() => setFormState({ mode: 'create', profile: null })} />
      ) : null}

      {sortedProfiles.length > 0 ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {sortedProfiles.map((profile) => (
            <Card
              key={profile.id}
              sx={{
                borderColor: profile.isDefault ? 'primary.main' : 'divider',
                boxShadow: profile.isDefault ? '0 14px 34px rgba(18, 109, 143, 0.14)' : undefined,
              }}
            >
              <CardContent sx={{ display: 'grid', gap: 2 }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
                  <Box
                    sx={{
                      alignItems: 'center',
                      bgcolor: profile.isDefault ? 'primary.main' : 'secondary.main',
                      borderRadius: '50%',
                      color: 'common.white',
                      display: 'flex',
                      flex: '0 0 auto',
                      fontWeight: 800,
                      height: 48,
                      justifyContent: 'center',
                      width: 48,
                    }}
                  >
                    {initials(profile.fullName)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="h5" sx={{ overflowWrap: 'anywhere' }}>{profile.fullName}</Typography>
                      {profile.isDefault ? <Chip color="primary" icon={<Star />} label="Default" size="small" /> : null}
                    </Stack>
                    <Typography color="text.secondary">
                      {profile.relationship} • {profile.gender} • {formatDate(profile.dateOfBirth)}
                    </Typography>
                  </Box>
                </Stack>
                <Divider />
                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  <InfoLine label="Phone" value={profile.phone} />
                  <InfoLine label="Blood type" value={profile.bloodType} />
                </Box>
              </CardContent>
              <CardActions sx={{ flexWrap: 'wrap', gap: 1, px: 2, pb: 2 }}>
                <Tooltip title="View profile details">
                  <Button startIcon={<Visibility />} onClick={() => setDetailsId(profile.id)}>View</Button>
                </Tooltip>
                <Tooltip title="Edit profile">
                  <Button startIcon={<Edit />} onClick={() => setFormState({ mode: 'edit', profile })}>Edit</Button>
                </Tooltip>
                {!profile.isDefault ? (
                  <Tooltip title="Set as default profile">
                    <Button
                      startIcon={<Star />}
                      onClick={() => { void setDefault(profile) }}
                      disabled={updateProfile.isPending}
                    >
                      Set Default
                    </Button>
                  </Tooltip>
                ) : null}
                <Tooltip title="Delete profile">
                  <Button color="error" startIcon={<Delete />} onClick={() => setDeleteTarget(profile)}>
                    Delete
                  </Button>
                </Tooltip>
              </CardActions>
            </Card>
          ))}
        </Box>
      ) : null}

      <ProfileFormDialog
        mode={formState?.mode ?? 'create'}
        open={Boolean(formState)}
        profile={formState?.profile ?? null}
        onClose={() => setFormState(null)}
      />
      <DetailsDialog id={detailsId} onClose={() => setDetailsId(null)} />
      <DeleteDialog key={deleteTarget?.id ?? 'closed'} profile={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </Box>
  )
}
