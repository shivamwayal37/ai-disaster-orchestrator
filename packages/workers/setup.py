from setuptools import setup, find_packages
import os

# Read the README
with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

# Find all packages under src
packages = find_packages(where="src")

setup(
    name="disaster-ingest-worker",
    version="0.1.0",
    author="Your Name",
    author_email="your.email@example.com",
    description="Ingestion worker for AI Disaster Response Orchestrator",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/ai-disaster-orchestrator",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    package_data={"ingest": ["*.py"]},
    python_requires=">=3.8",
    install_requires=[
        "aioredis>=2.0.0",
        "aiohttp>=3.8.0",
        "mysql-connector-python>=8.0.0",
        "python-dotenv>=0.19.0",
        "numpy>=1.20.0",
    ],
    entry_points={
        "console_scripts": [
            "disaster-ingest=ingest.__main__:main",
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Intended Audience :: Developers",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
    zip_safe=False,
)
