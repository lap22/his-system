using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class PatientProfileConfiguration
    : IEntityTypeConfiguration<PatientProfile>
{
    public void Configure(
        EntityTypeBuilder<PatientProfile> builder)
    {
        builder.ToTable("PatientProfiles");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.FullName)
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(x => x.Gender)
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(x => x.Phone)
            .HasMaxLength(20);

        builder.Property(x => x.Address)
            .HasMaxLength(500);

        builder.Property(x => x.BloodType)
            .HasMaxLength(10);


        builder.Property(x => x.Relationship)
            .HasConversion<string>()
            .HasMaxLength(30);

        builder.HasOne(x => x.User)
            .WithMany(x => x.PatientProfiles)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => x.UserId);

    }
}