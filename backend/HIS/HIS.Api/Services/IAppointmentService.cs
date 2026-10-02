using HIS.Api.DTOs.Appointments;
using HIS.Api.Enums;

namespace HIS.Api.Services;

public interface IAppointmentService
{
    Task<List<AvailableSlotResponse>> GetAvailableSlotsAsync(
        Guid doctorId,
        DateOnly date);

    Task<AppointmentResponse> CreateAsync(
        Guid currentUserId,
        CreateAppointmentRequest request);

    Task<List<AppointmentResponse>> GetMyAppointmentsAsync(
        Guid currentUserId);

    Task<AppointmentResponse?> GetByIdAsync(
        Guid currentUserId,
        Guid appointmentId,
        string currentUserRole);

    Task<AppointmentResponse?> CancelAsync(
        Guid currentUserId,
        Guid appointmentId,
        CancelAppointmentRequest request);

    Task<List<AppointmentResponse>> GetDoctorAppointmentsAsync(
        Guid currentUserId,
        DateOnly? date,
        AppointmentStatus? status);

    Task<AppointmentResponse?> ConfirmAsync(
        Guid currentUserId,
        Guid appointmentId,
        string currentUserRole);
}