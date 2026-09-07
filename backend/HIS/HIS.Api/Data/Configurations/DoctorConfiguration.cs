using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class DoctorConfiguration : IEntityTypeConfiguration<Doctor>
{
    public void Configure(EntityTypeBuilder<Doctor> builder)
    {
        builder.ToTable("Doctors");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.FullName)
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(x => x.Phone)
            .HasMaxLength(20);

        builder.Property(x => x.Specialization)
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(x => x.LicenseNumber)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(x => x.Biography)
            .HasMaxLength(2000);

        builder.Property(x => x.AvatarUrl)
            .HasMaxLength(1000);

        builder.HasIndex(x => x.LicenseNumber)
            .IsUnique();

        builder.HasIndex(x => x.UserId)
            .IsUnique();

        builder.HasOne(x => x.Department)
            .WithMany(x => x.Doctors)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}