using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HIS.Api.Migrations
{
    /// <inheritdoc />
    public partial class ConfigureDepartment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PatientProfiles_HealthInsuranceNumber",
                table: "PatientProfiles");

            migrationBuilder.DropIndex(
                name: "IX_PatientProfiles_IdentityNumber",
                table: "PatientProfiles");

            migrationBuilder.DropColumn(
                name: "HealthInsuranceNumber",
                table: "PatientProfiles");

            migrationBuilder.DropColumn(
                name: "IdentityNumber",
                table: "PatientProfiles");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Departments",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Departments",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Departments_Name",
                table: "Departments",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Departments_Name",
                table: "Departments");

            migrationBuilder.AddColumn<string>(
                name: "HealthInsuranceNumber",
                table: "PatientProfiles",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdentityNumber",
                table: "PatientProfiles",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Departments",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(150)",
                oldMaxLength: 150);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Departments",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientProfiles_HealthInsuranceNumber",
                table: "PatientProfiles",
                column: "HealthInsuranceNumber");

            migrationBuilder.CreateIndex(
                name: "IX_PatientProfiles_IdentityNumber",
                table: "PatientProfiles",
                column: "IdentityNumber");
        }
    }
}
