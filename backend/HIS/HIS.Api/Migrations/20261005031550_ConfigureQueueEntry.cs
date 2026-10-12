using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HIS.Api.Migrations
{
    /// <inheritdoc />
    public partial class ConfigureQueueEntry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_QueueEntries_Appointments_AppointmentId",
                table: "QueueEntries");

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "QueueEntries",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.CreateIndex(
                name: "IX_QueueEntries_Status",
                table: "QueueEntries",
                column: "Status");

            migrationBuilder.AddForeignKey(
                name: "FK_QueueEntries_Appointments_AppointmentId",
                table: "QueueEntries",
                column: "AppointmentId",
                principalTable: "Appointments",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_QueueEntries_Appointments_AppointmentId",
                table: "QueueEntries");

            migrationBuilder.DropIndex(
                name: "IX_QueueEntries_Status",
                table: "QueueEntries");

            migrationBuilder.AlterColumn<int>(
                name: "Status",
                table: "QueueEntries",
                type: "int",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(30)",
                oldMaxLength: 30);

            migrationBuilder.AddForeignKey(
                name: "FK_QueueEntries_Appointments_AppointmentId",
                table: "QueueEntries",
                column: "AppointmentId",
                principalTable: "Appointments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
