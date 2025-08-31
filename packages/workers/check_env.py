import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# List of required environment variables
required_vars = [
    'TIDB_HOST',
    'TIDB_USER',
    'TIDB_PASSWORD',
    'TIDB_DATABASE',
    'JINA_API_KEY'
]

print("Checking environment variables:")
print("-" * 50)

# Check each required variable
missing_vars = []
for var in required_vars:
    value = os.getenv(var)
    if value:
        # Mask sensitive values
        display_value = '***REDACTED***' if any(x in var.upper() for x in ['PASSWORD', 'KEY', 'SECRET', 'TOKEN']) else value
        print(f"✓ {var}: {display_value}")
    else:
        print(f"✗ {var}: NOT SET")
        missing_vars.append(var)

print("\nCurrent working directory:", os.getcwd())
print("Environment file location:", os.path.join(os.getcwd(), '.env'))

if missing_vars:
    print("\n❌ Missing required environment variables:", ", ".join(missing_vars))
    print("Please make sure these are set in your .env file")
else:
    print("\n✅ All required environment variables are set!")
