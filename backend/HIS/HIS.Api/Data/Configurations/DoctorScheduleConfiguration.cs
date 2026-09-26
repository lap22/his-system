using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class DoctorScheduleConfiguration
    : IEntityTypeConfiguration<DoctorSchedule>
{
    public void Configure(
        EntityTypeBuilder<DoctorSchedule> builder)
    {
        builder.ToTable("DoctorSchedules");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.DayOfWeek)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(x => x.StartTime)
            .IsRequired();

        builder.Property(x => x.EndTime)
            .IsRequired();

        builder.Property(x => x.SlotDurationMinutes)
            .IsRequired();

        builder.Property(x => x.MaxPatients)
            .IsRequired();

        builder.Property(x => x.IsActive)
            .IsRequired();

        builder.HasOne(x => x.Doctor)
            .WithMany(x => x.Schedules)
            .HasForeignKey(x => x.DoctorId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => new
        {
            x.DoctorId,
            x.DayOfWeek
        });
    }
}