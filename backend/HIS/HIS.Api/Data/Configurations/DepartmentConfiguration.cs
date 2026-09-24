using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class DepartmentConfiguration
    : IEntityTypeConfiguration<Department>
{
    public void Configure(
        EntityTypeBuilder<Department> builder)
    {
        builder.ToTable("Departments");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name)
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(x => x.Description)
            .HasMaxLength(1000);

        builder.HasIndex(x => x.Name)
            .IsUnique();
    }
}